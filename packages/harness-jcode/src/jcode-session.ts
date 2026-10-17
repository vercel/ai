import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
} from '@ai-sdk/harness';
import {
  parkJcodeClient,
  type JcodeSdkClient,
  type JcodeSdkEvent,
} from './jcode-client';
import {
  createJcodeTranslatorState,
  translateJcodeExternalToolCall,
  translateJcodeExternalToolResult,
  translateJcodeEvent,
} from './jcode-translate';
import { extractJcodePrompt, frameJcodeInstructions } from './jcode-utils';

const HARNESS_ID = 'jcode';

export interface CreateJcodeSessionInput {
  readonly client: JcodeSdkClient;
  readonly sessionId: string;
  readonly sessionWorkDir: string;
  readonly resumeJcodeSessionId?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly abortSignal?: AbortSignal;
}

function unsupported(message: string): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    harnessId: HARNESS_ID,
    message: `jcode: ${message}`,
  });
}

export async function createJcodeSession({
  client,
  sessionId,
  sessionWorkDir,
  resumeJcodeSessionId,
  model,
  reasoningEffort,
  abortSignal,
}: CreateJcodeSessionInput): Promise<HarnessV1Session> {
  if (abortSignal?.aborted) {
    await client.close();
    throw abortSignal.reason;
  }

  let jcodeSessionId: string;
  try {
    const nativeSession = resumeJcodeSessionId
      ? await client.attachSession(resumeJcodeSessionId)
      : await client.createSession(sessionWorkDir);
    jcodeSessionId = nativeSession.session_id;
    if (model) await client.setModel(jcodeSessionId, model);
    if (reasoningEffort) {
      await client.setReasoningEffort(jcodeSessionId, reasoningEffort);
    }
  } catch (error) {
    await client.close();
    throw error;
  }

  let closed = false;
  let activeCancel: (() => Promise<void>) | undefined;
  let activeDone: PromiseLike<void> | undefined;
  let isFirstPrompt = resumeJcodeSessionId == null;

  const lifecycleData = () => ({
    jcodeSessionId,
    ...(client.instanceHome ? { jcodeHome: client.instanceHome } : {}),
  });

  const assertOpen = () => {
    if (closed) throw new Error('jcode harness session is closed');
  };

  const runTurn = async (
    options: HarnessV1PromptTurnOptions,
  ): Promise<HarnessV1PromptControl> => {
    assertOpen();
    if (activeCancel) throw new Error('a Jcode turn is already active');
    if (options.responseFormat?.type === 'json') {
      throw unsupported('JSON response format is not supported yet');
    }

    const tools = options.tools ?? [];
    if (tools.length > 0 && !client.supports('external_tools_v1')) {
      throw unsupported(
        'the Jcode runtime does not support host-defined tools (external_tools_v1)',
      );
    }
    const toolNames = new Set<string>();
    const externalTools = tools.map(tool => {
      if (toolNames.has(tool.name)) {
        throw new Error(`duplicate host tool name: ${tool.name}`);
      }
      toolNames.add(tool.name);
      return {
        name: tool.name,
        description: tool.description ?? '',
        input_schema: tool.inputSchema ?? {},
      };
    });

    let prompt = extractJcodePrompt(options.prompt);
    if (isFirstPrompt && options.instructions) {
      prompt = frameJcodeInstructions(options.instructions, prompt);
    }
    isFirstPrompt = false;

    const iterator = client.events(jcodeSessionId);
    const state = createJcodeTranslatorState();
    const pendingExternalCalls = new Map<
      string,
      {
        readonly name: string;
        readonly ready: Promise<JcodeSdkEvent>;
        readonly resolveReady: (event: JcodeSdkEvent) => void;
        readonly rejectReady: (error: Error) => void;
        readyEvent?: JcodeSdkEvent;
        submitting: boolean;
      }
    >();
    const externalCallIds = new Set<string>();
    const submittedExternalResults = new Map<
      string,
      { readonly output: unknown; readonly isError: boolean }
    >();
    options.emit({
      type: 'stream-start',
      ...(model ? { modelId: model } : {}),
    });

    let settled = false;
    let cancelPromise: Promise<void> | undefined;
    let abortListener: (() => void) | undefined;
    const cancel = async () => {
      if (settled) return;
      cancelPromise ??= client.cancel(jcodeSessionId);
      await cancelPromise;
    };
    activeCancel = cancel;

    const done = (async () => {
      try {
        if (options.abortSignal) {
          abortListener = () => {
            void cancel().catch(() => {
              // The turn's event stream remains the source of truth. Avoid an
              // unhandled rejection if transport cancellation itself fails.
            });
          };
          options.abortSignal.addEventListener('abort', abortListener, {
            once: true,
          });
          if (options.abortSignal.aborted) await cancel();
        }

        await client.setExternalTools(jcodeSessionId, externalTools);
        await client.sendMessage(jcodeSessionId, prompt);
        for await (const event of iterator) {
          if (event.ev === 'tool_start' && toolNames.has(event.name)) {
            externalCallIds.add(event.call_id);
            for (const part of translateJcodeEvent(event, state)) {
              options.emit(part);
            }
            continue;
          }
          if (
            event.ev === 'tool_input_delta' &&
            externalCallIds.has(event.call_id)
          ) {
            translateJcodeEvent(event, state);
            continue;
          }
          if (event.ev === 'tool_exec' && externalCallIds.has(event.call_id)) {
            const tool = state.tools.get(event.call_id);
            if (!tool)
              throw new Error(`missing external tool state: ${event.call_id}`);
            tool.emitted = true;
            state.stepHadToolCall = true;
            let resolveReady!: (event: JcodeSdkEvent) => void;
            let rejectReady!: (error: Error) => void;
            const ready = new Promise<JcodeSdkEvent>((resolve, reject) => {
              resolveReady = resolve;
              rejectReady = reject;
            });
            void ready.catch(() => {});
            pendingExternalCalls.set(event.call_id, {
              name: event.name,
              ready,
              resolveReady,
              rejectReady,
              submitting: false,
            });
            let input: unknown = tool.input || {};
            try {
              input = tool.input ? JSON.parse(tool.input) : {};
            } catch {}
            options.emit(
              translateJcodeExternalToolCall({
                ev: 'external_tool_call',
                session_id: jcodeSessionId,
                root_session_id: jcodeSessionId,
                call_id: event.call_id,
                catalog_revision: 0,
                name: event.name,
                input,
              }),
            );
            continue;
          }
          if (
            event.ev === 'tool_done' &&
            externalCallIds.delete(event.call_id)
          ) {
            const submitted = submittedExternalResults.get(event.call_id);
            submittedExternalResults.delete(event.call_id);
            state.tools.delete(event.call_id);
            options.emit(
              translateJcodeExternalToolResult({
                toolCallId: event.call_id,
                toolName: event.name,
                output: submitted?.output ?? event.error ?? event.output,
                isError: submitted?.isError ?? event.error != null,
              }),
            );
            continue;
          }
          if (event.ev === 'external_tool_call') {
            if (event.root_session_id !== jcodeSessionId) {
              throw new Error(
                `external tool call ${event.call_id} was routed to the wrong root session`,
              );
            }
            if (!event.session_id) {
              throw new Error(
                `external tool call ${event.call_id} has no calling session`,
              );
            }
            if (!toolNames.has(event.name)) {
              throw new Error(
                `external tool call ${event.call_id} references unknown tool ${event.name}`,
              );
            }
            const pending = pendingExternalCalls.get(event.call_id);
            if (pending?.readyEvent) {
              throw new Error(
                `duplicate external tool call id: ${event.call_id}`,
              );
            }
            if (pending) {
              pending.readyEvent = event;
              pending.resolveReady(event);
            } else {
              let resolveReady!: (event: JcodeSdkEvent) => void;
              let rejectReady!: (error: Error) => void;
              const ready = new Promise<JcodeSdkEvent>((resolve, reject) => {
                resolveReady = resolve;
                rejectReady = reject;
              });
              void ready.catch(() => {});
              const fallback = {
                name: event.name,
                ready,
                resolveReady,
                rejectReady,
                readyEvent: event,
                submitting: false,
              };
              pendingExternalCalls.set(event.call_id, fallback);
              fallback.resolveReady(event);
              state.stepHadToolCall = true;
              options.emit(translateJcodeExternalToolCall(event));
            }
            continue;
          }
          if (event.ev === 'error') {
            throw new Error(`${event.code}: ${event.message}`);
          }
          for (const part of translateJcodeEvent(event, state)) {
            options.emit(part);
          }
          if (event.ev === 'turn_done') return;
        }
        throw new Error('Jcode event stream closed before turn_done');
      } catch (error) {
        options.emit({ type: 'error', error });
        throw error;
      } finally {
        for (const pending of pendingExternalCalls.values()) {
          if (!pending.readyEvent) {
            pending.rejectReady(
              new Error(
                'Jcode turn ended before the external tool call became ready',
              ),
            );
          }
        }
        pendingExternalCalls.clear();
        settled = true;
        activeCancel = undefined;
        activeDone = undefined;
        if (abortListener && options.abortSignal) {
          options.abortSignal.removeEventListener('abort', abortListener);
        }
        await iterator.return?.();
      }
    })();
    activeDone = done;

    return {
      done,
      async submitToolResult({ toolCallId, output, isError }) {
        const pending = pendingExternalCalls.get(toolCallId);
        if (!pending) {
          throw new Error(
            `unknown or settled external tool call: ${toolCallId}`,
          );
        }
        if (pending.submitting) {
          throw new Error(
            `external tool result submission is already in flight: ${toolCallId}`,
          );
        }
        pending.submitting = true;
        submittedExternalResults.set(toolCallId, {
          output,
          isError: isError ?? false,
        });
        try {
          const readyEvent = pending.readyEvent ?? (await pending.ready);
          if (readyEvent.ev !== 'external_tool_call') {
            throw new Error(
              `unexpected external tool readiness event: ${readyEvent.ev}`,
            );
          }
          await client.submitExternalToolResult(jcodeSessionId, {
            call_id: toolCallId,
            output,
            is_error: isError ?? false,
          });
          pendingExternalCalls.delete(toolCallId);
        } catch (error) {
          submittedExternalResults.delete(toolCallId);
          pending.submitting = false;
          throw error;
        }
      },
      async submitUserMessage(text) {
        await client.softInterrupt(jcodeSessionId, text);
      },
    };
  };

  const resumeState = (): HarnessV1ResumeSessionState => ({
    type: 'resume-session',
    harnessId: HARNESS_ID,
    specificationVersion: 'harness-v1',
    data: lifecycleData(),
  });

  return {
    sessionId,
    isResume: resumeJcodeSessionId != null,
    ...(model ? { modelId: model } : {}),
    doPromptTurn: runTurn,
    async doCompact(customInstructions) {
      assertOpen();
      if (customInstructions) {
        throw unsupported('custom compaction instructions are not supported');
      }
      await client.compact(jcodeSessionId);
    },
    async doContinueTurn() {
      throw unsupported(
        'lossless turn continuation requires event replay cursors in the Jcode SDK',
      );
    },
    async doSuspendTurn() {
      throw unsupported(
        'turn suspension requires event replay cursors in the Jcode SDK',
      );
    },
    async doDetach() {
      assertOpen();
      if (activeCancel) {
        throw unsupported(
          'cannot detach while a turn is active; suspend it first',
        );
      }
      await client.detachSession(jcodeSessionId);
      parkJcodeClient(jcodeSessionId, client);
      closed = true;
      return resumeState();
    },
    async doStop() {
      assertOpen();
      if (activeCancel) await activeCancel();
      if (activeDone) await activeDone;
      await client.detachSession(jcodeSessionId);
      const state = resumeState();
      closed = true;
      await client.close();
      return state;
    },
    async doDestroy() {
      if (closed) return;
      if (activeCancel) await activeCancel();
      if (activeDone) {
        try {
          await activeDone;
        } catch {
          // Destruction must still release the owned runtime after turn failure.
        }
      }
      closed = true;
      await client.close();
    },
  };
}
