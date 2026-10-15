import { createHash, randomUUID } from 'node:crypto';
import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1BuiltinTool,
  type HarnessV1ContinueTurnOptions,
  type HarnessV1ContinueTurnState,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1Session,
  type HarnessV1StartOptions,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { getRestrictedSandboxSession } from '@ai-sdk/harness/utils';
import { asSchema } from '@ai-sdk/provider-utils';
import type { FxHarnessSettings } from './fx-harness';
import { createFxMcpRuntime } from './fx-mcp';
import { createFxRemoteOps, diffFxWorkspace } from './fx-remote-ops';
import {
  createFxStateStore,
  fxResumeStateSchema,
  type FxStoredState,
  type FxToolRecord,
} from './fx-resume-state';
import {
  createFxRuntime,
  type FxAgent,
  type FxPrompt,
  type FxTool,
  type FxToolResult,
  type FxTurn,
} from './fx-runtime';
import { createFxSkillsRuntime } from './fx-skills';
import {
  fxJsonValue,
  fxToolRequiresApproval,
  toFxToolResult,
  type FxToolSubmission,
} from './fx-tools';
import { createFxTransport } from './fx-transport';
import { createFxTranslator, emptyFxUsage } from './fx-translate';

function toPrompt(prompt: HarnessV1PromptTurnOptions['prompt']): FxPrompt {
  if (typeof prompt === 'string') return prompt;
  if (typeof prompt.content === 'string') return prompt.content;
  return prompt.content.map(part => {
    if (part.type === 'text') return { type: 'text' as const, text: part.text };
    if (
      part.type === 'image' &&
      (typeof part.image === 'string' ||
        part.image instanceof Uint8Array ||
        part.image instanceof ArrayBuffer)
    ) {
      return {
        type: 'image' as const,
        data:
          typeof part.image === 'string'
            ? part.image
            : Buffer.from(
                part.image instanceof ArrayBuffer
                  ? new Uint8Array(part.image)
                  : part.image,
              ).toString('base64'),
        mimeType: part.mediaType ?? 'image/png',
      };
    }
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'fx',
      message:
        'fx prompts support text and inline images, not files or image URLs.',
    });
  });
}

export async function createFxSession(options: {
  startOpts: HarnessV1StartOptions;
  settings: FxHarnessSettings;
  environment: Record<string, string>;
  builtinTools: Record<string, HarnessV1BuiltinTool<any, any>>;
  clientApp: string;
}): Promise<HarnessV1Session> {
  const { startOpts, settings } = options;
  startOpts.abortSignal?.throwIfAborted();
  const resume =
    startOpts.continueFrom ??
    startOpts.resumeFrom?.continueFrom ??
    startOpts.resumeFrom;
  if (
    resume &&
    (resume.harnessId !== 'fx' || resume.specificationVersion !== 'harness-v1')
  ) {
    throw new Error('Cannot import lifecycle state from a different harness.');
  }
  const sandbox = getRestrictedSandboxSession(startOpts.sandboxSession);
  const store = await createFxStateStore({
    sandbox,
    sessionId: startOpts.sessionId,
    workDir: startOpts.sessionWorkDir,
    stateFileName: resume
      ? fxResumeStateSchema.parse(resume.data).stateFileName
      : undefined,
  });
  const state: FxStoredState = resume
    ? await store.load()
    : { version: 1, sdkVersion: '0.0.13' };
  const remote = createFxRemoteOps({
    sandbox,
    workDir: startOpts.sessionWorkDir,
  });
  const save = () => store.save(state);
  await save();
  let stopped = false;
  let active:
    | {
        suspend(): Promise<void>;
        done: Promise<void>;
        control: HarnessV1PromptControl;
        attach(emit: (part: HarnessV1StreamPart) => void): void;
      }
    | undefined;

  async function runTurn(input: {
    turnOptions: HarnessV1PromptTurnOptions | HarnessV1ContinueTurnOptions;
    continuing: boolean;
  }): Promise<HarnessV1PromptControl> {
    if (stopped) throw new Error('fx session has been stopped.');
    if (active && !state.turn) await active.done;
    const opts = input.turnOptions;
    const serviceTierOptions =
      settings.serviceTier === undefined || settings.serviceTier === 'default'
        ? undefined
        : {
            fast: settings.serviceTier === 'fast',
            ultrafast: settings.serviceTier === 'ultrafast',
          };
    const signature = createHash('sha256')
      .update(
        JSON.stringify({
          model: opts.model,
          skills: opts.skills,
          instructions: opts.instructions,
          tools: opts.tools,
          responseFormat: opts.responseFormat,
          filtering: startOpts.builtinToolFiltering,
          permissionMode: startOpts.permissionMode,
          mcpServers: settings.mcpServers,
          effort: settings.effort,
          fast: serviceTierOptions?.fast,
          ultrafast: serviceTierOptions?.ultrafast,
        }),
      )
      .digest('hex');
    if (input.continuing) {
      if (!state.turn)
        throw new Error('There is no suspended fx turn to continue.');
      if (state.turn.signature !== signature)
        throw new Error(
          'Cannot change fx settings while continuing an unfinished turn.',
        );
      if (active) {
        active.attach(opts.emit);
        return active.control;
      }
    } else {
      if (state.turn)
        throw new Error(
          'Continue the unfinished fx turn before prompting again.',
        );
      state.turn = {
        id: randomUUID(),
        prompt: toPrompt((opts as HarnessV1PromptTurnOptions).prompt),
        signature,
        responseFormat: opts.responseFormat,
        models: [],
        tools: [],
        emittedKeys: [],
        steers: [],
      };
    }
    const turnState = state.turn!;
    const emitted = new Set(turnState.emittedKeys);
    let suspending = false;
    const controller = new AbortController();
    const signal = opts.abortSignal
      ? AbortSignal.any([controller.signal, opts.abortSignal])
      : controller.signal;
    let runtime: FxAgent | undefined;
    let runtimeTurn: FxTurn | undefined;
    let transport: ReturnType<typeof createFxTransport> | undefined;
    let mcp: Awaited<ReturnType<typeof createFxMcpRuntime>> | undefined;
    const results = new Map<string, FxToolSubmission>();
    const approvals = new Map<string, { approved: boolean; reason?: string }>();
    const wake = new Set<() => void>();
    const identities: Array<{ id: string; name: string }> = [];
    const seenIdentities = new Set<string>();
    let callbackIndex = 0;
    const replaySteers = [...turnState.steers];
    const pendingSteers: string[] = [];
    function recordSteer(text: string) {
      const index = pendingSteers.indexOf(text);
      if (index === -1) return;
      pendingSteers.splice(index, 1);
      turnState.steers.push({
        text,
        beforeRequest: (transport?.requestIndex ?? -1) + 1,
      });
    }
    let emitTarget = opts.emit;
    const emit = (part: HarnessV1StreamPart) => {
      if (!suspending) emitTarget(part);
    };
    function emitOnce(input: { key: string; part: HarnessV1StreamPart }) {
      if (suspending || emitted.has(input.key)) return;
      emitted.add(input.key);
      turnState.emittedKeys.push(input.key);
      emit(input.part);
    }
    const translator = createFxTranslator({ turnId: turnState.id, emit });
    function flushStep(requestIndex: number) {
      const step = translator.steps.get(requestIndex);
      if (step)
        emitOnce({
          key: `step:${requestIndex}`,
          part: { type: 'finish-step', ...step },
        });
    }
    function notify() {
      for (const resolve of wake) resolve();
      wake.clear();
    }
    async function waitFor<T>(get: () => T | undefined): Promise<T> {
      for (;;) {
        signal.throwIfAborted();
        const value = get();
        if (value !== undefined) return value;
        await new Promise<void>(resolve => {
          const finish = () => {
            signal.removeEventListener('abort', finish);
            wake.delete(finish);
            resolve();
          };
          wake.add(finish);
          signal.addEventListener('abort', finish, { once: true });
          if (signal.aborted) finish();
        });
      }
    }
    function earlyStep(record: FxToolRecord) {
      emitOnce({
        key: `waiting:${record.id}`,
        part: {
          type: 'finish-step',
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage: emptyFxUsage(),
        },
      });
    }
    async function executeTool(input: {
      tool: FxTool;
      value: unknown;
      providerExecuted: boolean;
      kind: 'readonly' | 'edit' | 'bash';
    }): Promise<FxToolResult> {
      signal.throwIfAborted();
      const identity = identities[callbackIndex++];
      if (!identity || identity.name !== input.tool.name)
        throw new Error(
          'fx tool callback could not be matched to its original call ID.',
        );
      let record = turnState.tools.find(item => item.id === identity.id);
      if (
        record &&
        (record.name !== input.tool.name ||
          JSON.stringify(record.input) !== JSON.stringify(input.value))
      )
        throw new Error('fx continuation changed a recorded tool call.');
      if (!record) {
        record = {
          id: identity.id,
          name: input.tool.name,
          input: fxJsonValue(input.value),
          status: 'waiting',
        };
        turnState.tools.push(record);
      }
      const current = record;
      emitOnce({
        key: `call:${current.id}`,
        part: {
          type: 'tool-call',
          toolCallId: current.id,
          toolName: current.name,
          input: JSON.stringify(current.input),
          providerExecuted: input.providerExecuted,
          ...(current.name.startsWith('mcp_') ? { dynamic: true } : {}),
          ...(input.providerExecuted ? { nativeName: current.name } : {}),
        },
      });
      if (current.status !== 'completed') {
        await save();
        if (current.status === 'executing') {
          current.result = {
            type: 'libfx.tool-result',
            text: 'This tool execution was interrupted and its outcome is unknown. It was not executed again. Inspect the sandbox before retrying.',
            images: [],
            isError: true,
          };
          current.output = current.result.text;
          if (current.before)
            current.changes = diffFxWorkspace({
              before: current.before,
              after: await remote.snapshot(),
            });
        } else if (!input.providerExecuted) {
          earlyStep(current);
          const submission = await waitFor(() => results.get(current.id));
          current.result = toFxToolResult(submission);
          current.output = fxJsonValue(submission.output);
        } else {
          if (
            fxToolRequiresApproval({
              permissionMode: startOpts.permissionMode ?? 'allow-all',
              kind: input.kind,
            })
          ) {
            current.approvalId ??= `fx:${current.id}`;
            emitOnce({
              key: `approval:${current.id}`,
              part: {
                type: 'tool-approval-request',
                approvalId: current.approvalId,
                toolCallId: current.id,
              },
            });
            earlyStep(current);
            await save();
            current.approval ??= await waitFor(() =>
              approvals.get(current.approvalId!),
            );
            if (!current.approval.approved) {
              current.result = {
                type: 'libfx.tool-result',
                text: current.approval.reason ?? 'Tool execution denied.',
                images: [],
                isError: true,
              };
              current.output = current.result.text;
            }
          }
          if (!current.result) {
            signal.throwIfAborted();
            if (input.kind !== 'readonly')
              current.before = await remote.snapshot();
            current.status = 'executing';
            await save();
            signal.throwIfAborted();
            try {
              const output = await input.tool.execute(input.value, { signal });
              current.output = fxJsonValue(output);
              current.result =
                typeof output === 'object' &&
                output != null &&
                'type' in output &&
                output.type === 'libfx.tool-result'
                  ? (output as FxToolResult)
                  : {
                      type: 'libfx.tool-result',
                      text:
                        typeof output === 'string'
                          ? output
                          : JSON.stringify(output),
                      images: [],
                    };
            } catch (error) {
              if (signal.aborted) throw error;
              current.result = (error as { toolResult?: FxToolResult })
                ?.toolResult ?? {
                type: 'libfx.tool-result',
                text: error instanceof Error ? error.message : String(error),
                images: [],
                isError: true,
              };
              current.result.isError = true;
              current.output = current.result.text;
            }
            if (current.before)
              current.changes = diffFxWorkspace({
                before: current.before,
                after: await remote.snapshot(),
              });
          }
        }
        current.status = 'completed';
        await save();
      }
      signal.throwIfAborted();
      for (const change of current.changes ?? [])
        emitOnce({
          key: `file:${current.id}:${change.path}`,
          part: { type: 'file-change', ...change },
        });
      emitOnce({
        key: `result:${current.id}`,
        part: {
          type: 'tool-result',
          toolCallId: current.id,
          toolName: current.name,
          result: fxJsonValue(current.output) ?? '',
          isError: current.result?.isError,
          ...(current.name.startsWith('mcp_') ? { dynamic: true } : {}),
        },
      });
      await save();
      if (!current.result)
        throw new Error('Recorded fx tool result is missing.');
      if (current.result.isError)
        throw Object.assign(new Error(current.result.text), {
          toolResult: current.result,
        });
      return current.result;
    }

    const done = (async () => {
      try {
        await save();
        const skills = await createFxSkillsRuntime({ skills: opts.skills });
        mcp = await createFxMcpRuntime({
          mcpServers: settings.mcpServers,
          abortSignal: signal,
        });
        const tools: FxTool[] = [];
        const customNames = new Set(opts.tools.map(tool => tool.name));
        const filtering = startOpts.builtinToolFiltering;
        for (const [name, builtin] of Object.entries(options.builtinTools)) {
          if (customNames.has(name)) continue;
          const included =
            filtering == null ||
            (filtering.mode === 'allow'
              ? filtering.toolNames.includes(name)
              : !filtering.toolNames.includes(name));
          if (!included) continue;
          const kind = builtin.toolUseKind ?? 'readonly';
          const implementation: FxTool = {
            name,
            description:
              typeof builtin.description === 'string'
                ? builtin.description
                : name,
            inputSchema: await asSchema(builtin.inputSchema).jsonSchema,
            execute: async (value, context) => {
              const operation = remote[name as keyof typeof remote];
              if (!operation || name === 'snapshot')
                throw new Error(`Unsupported sandbox tool ${name}`);
              return (operation as (input: unknown) => Promise<unknown>)({
                ...(value as object),
                signal: context.signal,
              });
            },
          };
          tools.push({
            ...implementation,
            execute: value =>
              executeTool({
                tool: implementation,
                value,
                providerExecuted: name !== 'askUserQuestions',
                kind,
              }),
          });
        }
        for (const spec of opts.tools) {
          const implementation: FxTool = {
            name: spec.name,
            description: spec.description ?? spec.name,
            inputSchema: spec.inputSchema ?? { type: 'object', properties: {} },
            execute: async () => undefined,
          };
          tools.push({
            ...implementation,
            execute: value =>
              executeTool({
                tool: implementation,
                value,
                providerExecuted: false,
                kind: 'readonly',
              }),
          });
        }
        for (const tool of mcp.tools) {
          let name = tool.name;
          for (
            let suffix = 2;
            tools.some(existing => existing.name === name);
            suffix++
          )
            name = `${tool.name.slice(0, 58)}_${suffix}`;
          const implementation = { ...tool, name };
          tools.push({
            ...implementation,
            execute: value =>
              executeTool({
                tool: implementation,
                value,
                providerExecuted: true,
                kind: 'bash',
              }),
          });
        }
        transport = createFxTransport({
          baseUrl: options.environment.AI_GATEWAY_BASE_URL,
          headers: {
            ...settings.headers,
            ...startOpts.headers,
            'user-agent': options.clientApp,
            'x-client-app': options.clientApp,
          },
          turn: turnState,
          responseFormat: turnState.responseFormat,
          save,
          onPart: translator.onPart,
          onRequest: ({ requestIndex, modelId }) => {
            if (requestIndex > 0) flushStep(requestIndex - 1);
            emitOnce({ key: 'start', part: { type: 'stream-start', modelId } });
          },
          beforeRelease: ({ requestIndex }) => {
            for (const steer of replaySteers.filter(
              steer => steer.beforeRequest === requestIndex + 1,
            )) {
              void runtimeTurn?.steer(steer.text).catch(() => {});
            }
            notify();
          },
        });
        signal.throwIfAborted();
        runtime = await createFxRuntime({
          apiKey: options.environment.AI_GATEWAY_API_KEY ?? '',
          ...(opts.model ? { model: opts.model } : {}),
          ...(settings.effort ? { effort: settings.effort } : {}),
          ...serviceTierOptions,
          instructions: [
            opts.instructions,
            skills.instructions,
            mcp.instructions,
            `All filesystem and shell tools operate in the sandbox workspace ${startOpts.sessionWorkDir}.`,
          ]
            .filter(Boolean)
            .join('\n\n'),
          tools,
          fetch: transport.fetch,
          backend: settings.backend,
          checkpoint: state.checkpoint
            ? Buffer.from(state.checkpoint, 'base64')
            : undefined,
          onEvent: event => {
            if (event.type !== 'acp.receive') return;
            const message = event.message as {
              method?: string;
              params?: {
                update?: {
                  sessionUpdate?: string;
                  toolCallId?: string;
                  name?: string;
                  toolName?: string;
                  title?: string;
                  content?: { type?: string; text?: string };
                };
              };
            };
            const update = message.params?.update;
            if (
              update?.sessionUpdate === 'user_message_chunk' &&
              update.content?.type === 'text'
            ) {
              recordSteer(update.content.text ?? '');
            }
            if (
              message.method === 'session/update' &&
              update?.sessionUpdate === 'tool_call' &&
              update.toolCallId &&
              !seenIdentities.has(update.toolCallId)
            ) {
              seenIdentities.add(update.toolCallId);
              identities.push({
                id: update.toolCallId,
                name: update.name ?? update.toolName ?? update.title ?? 'tool',
              });
            }
          },
        });
        signal.throwIfAborted();
        if (!state.checkpoint) {
          state.checkpoint = Buffer.from(await runtime.checkpoint()).toString(
            'base64',
          );
          await save();
        }
        runtimeTurn = runtime.prompt(turnState.prompt, { signal });
        notify();
        const draining = (async () => {
          for await (const event of runtimeTurn!) {
            if (event.type === 'user_message') recordSteer(event.text);
          }
        })();
        const result = await runtimeTurn.result;
        await draining;
        if (suspending) return;
        signal.throwIfAborted();
        flushStep(transport.requestIndex);
        const finishReason = translator.steps.get(transport.requestIndex)
          ?.finishReason ?? {
          unified: result.stopReason === 'max_tokens' ? 'length' : 'stop',
          raw: result.stopReason,
        };
        state.checkpoint = Buffer.from(await runtime.checkpoint()).toString(
          'base64',
        );
        state.turn = undefined;
        await save();
        emit({
          type: 'finish',
          finishReason,
          totalUsage: translator.totalUsage(),
        });
      } catch (error) {
        if (!suspending) {
          emit({ type: 'error', error });
          throw error;
        }
      } finally {
        await runtime?.close();
        await transport?.stop();
        await mcp?.close();
        await save();
        active = undefined;
      }
    })();
    void done.catch(() => {});
    const control: HarnessV1PromptControl = {
      done,
      submitToolResult: async submission => {
        results.set(submission.toolCallId, submission);
        notify();
      },
      submitToolApproval: async approval => {
        approvals.set(approval.approvalId, approval);
        notify();
      },
      submitUserMessage: async text => {
        await waitFor(() =>
          runtimeTurn &&
          transport &&
          transport.requestIndex >= turnState.models.length - 1
            ? true
            : undefined,
        );
        pendingSteers.push(text);
        await runtimeTurn!.steer(text);
        await save();
      },
    };
    active = {
      done,
      control,
      attach: emit => {
        emitTarget = emit;
      },
      suspend: async () => {
        suspending = true;
        controller.abort();
        runtimeTurn?.cancel();
        notify();
        await done;
      },
    };
    return control;
  }

  const continuation = (): HarnessV1ContinueTurnState => ({
    type: 'continue-turn',
    harnessId: 'fx',
    specificationVersion: 'harness-v1',
    data: { version: 1, stateFileName: store.fileName },
  });
  async function stop() {
    if (!stopped) {
      await active?.suspend();
      stopped = true;
      await save();
      await store.flush();
    }
    return {
      type: 'resume-session' as const,
      harnessId: 'fx',
      specificationVersion: 'harness-v1' as const,
      data: { version: 1, stateFileName: store.fileName },
      ...(state.turn ? { continueFrom: continuation() } : {}),
    };
  }
  return {
    sessionId: startOpts.sessionId,
    isResume: resume != null,
    doPromptTurn: turnOptions => runTurn({ turnOptions, continuing: false }),
    doContinueTurn: turnOptions => runTurn({ turnOptions, continuing: true }),
    doCompact: async () => {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'fx',
        message: 'Stable libfx does not expose manual context compaction.',
      });
    },
    doSuspendTurn: async () => {
      if (stopped) throw new Error('fx session has been stopped.');
      await active?.suspend();
      await save();
      return continuation();
    },
    doDetach: stop,
    doStop: stop,
    doDestroy: async () => {
      await stop();
    },
  };
}
