import type {
  HarnessV1,
  HarnessV1Prompt,
  HarnessV1PromptControl,
  HarnessV1Session,
  HarnessV1StreamPart,
  HarnessV1ToolSpec,
} from '../../v1';
import { toHarnessStream } from './to-harness-stream';
import {
  safeParseJSON,
  type Context,
  type Experimental_SandboxSession as SandboxSession,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type { LanguageModelV4ToolCall } from '@ai-sdk/provider';
import {
  parseToolCall,
  type ContentPart,
  type TelemetryOptions,
  type TextStreamPart,
} from 'ai';
import { HarnessStreamTextResult } from './harness-stream-text-result';
import { translateStreamPart } from './translate-stream-part';
import { stripWorkDir } from './strip-work-dir';
import { createTurnTelemetry, type TurnContentPart } from './turn-telemetry';

/**
 * Drive one prompt turn end-to-end:
 *  - call `session.doPrompt` via `toHarnessStream`
 *  - translate harness events to AI SDK `TextStreamPart`s and push into the
 *    result object
 *  - execute host-side user tools when their `tool-call` events arrive and
 *    submit results back to the harness
 *  - close the result when the harness signals `finish` (or on error)
 *
 * Returns the result synchronously after the stream is wired up; callers
 * await its `PromiseLike` accessors to observe completion.
 */
export function runPrompt<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
>(input: {
  harness: HarnessV1;
  session: HarnessV1Session;
  prompt: HarnessV1Prompt;
  instructions: string | undefined;
  tools: TOOLS;
  toolSpecs: HarnessV1ToolSpec[];
  sandboxSession: SandboxSession | undefined;
  sessionWorkDir: string | undefined;
  runtimeContext: RUNTIME_CONTEXT;
  abortSignal: AbortSignal | undefined;
  telemetry?: TelemetryOptions | undefined;
}): {
  result: HarnessStreamTextResult<TOOLS, RUNTIME_CONTEXT>;
  done: Promise<void>;
} {
  const result = new HarnessStreamTextResult<TOOLS, RUNTIME_CONTEXT>({
    tools: input.tools,
    runtimeContext: input.runtimeContext,
    // toolsContext is not configurable for harnesses; pass undefined cast.
    toolsContext: undefined as never,
    harnessId: input.harness.harnessId,
    sessionId: input.session.sessionId,
  });

  const telemetry = createTurnTelemetry({
    telemetry: input.telemetry,
    harnessId: input.harness.harnessId,
    modelId: input.session.modelId,
    instructions: input.instructions,
    promptText: promptToText(input.prompt),
    runtimeContext: input.runtimeContext,
  });

  const done = (async () => {
    let bridge: Awaited<ReturnType<typeof toHarnessStream>>;
    try {
      bridge = await toHarnessStream({
        session: input.session,
        prompt: input.prompt,
        tools: input.toolSpecs,
        instructions: input.instructions,
        abortSignal: input.abortSignal,
      });
    } catch (err) {
      telemetry.error(err);
      result.fail(err);
      return;
    }

    const { stream, control } = bridge;
    const reader = stream.getReader();

    // Accumulate the model's output content per step so telemetry can record
    // `gen_ai.output.messages` and reporters can log what was actually said.
    let stepText = '';
    let stepReasoning = '';
    let stepToolCalls: TurnContentPart[] = [];
    const buildStepContent = (): TurnContentPart[] => {
      const parts: TurnContentPart[] = [];
      if (stepText) parts.push({ type: 'text', text: stepText });
      if (stepReasoning) parts.push({ type: 'reasoning', text: stepReasoning });
      parts.push(...stepToolCalls);
      return parts;
    };
    const resetStepContent = (): void => {
      stepText = '';
      stepReasoning = '';
      stepToolCalls = [];
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value == null) continue;

        // Begin the operation span on stream-start, using the runtime-resolved
        // model the adapter reports (falling back to the session's model).
        if (value.type === 'stream-start') {
          telemetry.start(value.modelId ?? input.session.modelId);
        }

        // Open a step span lazily before the first content of each step.
        if (
          value.type !== 'stream-start' &&
          value.type !== 'finish-step' &&
          value.type !== 'finish' &&
          value.type !== 'error'
        ) {
          telemetry.ensureStepOpen();
        }

        /*
         * Strip the session working-directory prefix for everything the
         * consumer sees. The original `value` is kept intact for host tool
         * execution below — the tools need the absolute path to resolve
         * against the sandbox root, so the strip is display-only.
         */
        const displayValue = stripWorkDir(value, input.sessionWorkDir);

        // Forward to consumer as soon as possible.
        for (const part of translateStreamPart<TOOLS>(displayValue)) {
          result.enqueue(part);
        }

        // Tool-call validation lives here (not in translateStreamPart) because
        // schema parsing is async and needs the merged tool set in scope.
        if (displayValue.type === 'tool-call') {
          const parsed = await validateToolCall<TOOLS>({
            event: displayValue,
            tools: input.tools,
          });
          result.enqueue(parsed);
        }

        // Accumulate output content for telemetry / reporters.
        if (value.type === 'text-delta') {
          stepText += value.delta;
        } else if (value.type === 'reasoning-delta') {
          stepReasoning += value.delta;
        }

        // Telemetry: a tool execution begins on its `tool-call`.
        if (value.type === 'tool-call') {
          stepToolCalls.push({
            type: 'tool-call',
            toolCallId: value.toolCallId,
            toolName: value.toolName,
            input: value.input,
          });
          telemetry.toolStart({
            toolCallId: value.toolCallId,
            toolName: value.toolName,
            input: value.input,
          });
        }

        // Telemetry: close a tool span when its provider-executed result lands.
        if (value.type === 'tool-result') {
          telemetry.toolEnd(
            value.toolCallId,
            value.isError
              ? { ok: false, error: value.result }
              : { ok: true, output: value.result },
          );
        }

        // Drive step boundaries.
        if (value.type === 'finish-step') {
          telemetry.stepFinish({
            finishReason: value.finishReason,
            usage: value.usage,
            providerMetadata: value.harnessMetadata,
            content: buildStepContent(),
          });
          resetStepContent();
          result.finishStep({
            finishReason: value.finishReason,
            usage: value.usage,
            providerMetadata: value.harnessMetadata,
            warnings: [],
          });
        }

        if (value.type === 'finish') {
          telemetry.end({
            finishReason: value.finishReason,
            usage: value.totalUsage,
          });
        }

        // Execute host-side tools when the harness asks for one.
        if (value.type === 'tool-call' && !value.providerExecuted) {
          const outcome = await maybeExecuteHostTool({
            event: value,
            tools: input.tools,
            sandboxSession: input.sandboxSession,
            abortSignal: input.abortSignal,
            control,
          });
          telemetry.toolEnd(value.toolCallId, outcome);
        }

        if (value.type === 'error') {
          telemetry.error(value.error);
          result.fail(value.error);
          return;
        }
      }
      await result.finish();
    } catch (err) {
      telemetry.error(err);
      result.fail(err);
    } finally {
      reader.releaseLock();
    }
  })();

  // Swallow the loop's rejection at the top level — failures are observable
  // via the result's `fullStream` `error` part and rejected promise
  // accessors. We do not want the orphan promise to become an unhandled
  // rejection.
  done.catch(() => {});

  return { result, done };
}

type HostToolOutcome =
  | { ok: true; output: unknown }
  | { ok: false; error: unknown };

async function maybeExecuteHostTool<TOOLS extends ToolSet>(input: {
  event: { toolCallId: string; toolName: string; input: string };
  tools: TOOLS;
  sandboxSession: SandboxSession | undefined;
  abortSignal: AbortSignal | undefined;
  control: HarnessV1PromptControl;
}): Promise<HostToolOutcome> {
  const tool = (input.tools as Record<string, unknown>)[input.event.toolName] as
    | {
        execute?: (
          args: unknown,
          options: {
            abortSignal?: AbortSignal;
            experimental_sandbox?: SandboxSession;
          },
        ) => unknown | Promise<unknown>;
      }
    | undefined;

  if (tool?.execute == null) return { ok: true, output: undefined };

  const parsed = await safeParseJSON({ text: input.event.input });
  const args = parsed.success ? parsed.value : input.event.input;

  try {
    const output = await tool.execute(args, {
      abortSignal: input.abortSignal,
      experimental_sandbox: input.sandboxSession,
    });
    await input.control.submitToolResult({
      toolCallId: input.event.toolCallId,
      output,
    });
    return { ok: true, output };
  } catch (err) {
    await input.control.submitToolResult({
      toolCallId: input.event.toolCallId,
      output: { error: String(err) },
      isError: true,
    });
    return { ok: false, error: err };
  }
}

/*
 * Validate an inbound `tool-call` event against the merged tool set's schema
 * using the AI SDK's canonical `parseToolCall`. Returns an AI SDK `tool-call`
 * stream part with parsed input on success, or a `dynamic + invalid: true`
 * part on failure (unknown tool, schema mismatch, malformed JSON).
 *
 * The harness `tool-call` event is structurally a `LanguageModelV4ToolCall`
 * (plus an optional harness-only `nativeName`). `providerExecuted` already
 * lives on the V4 type — `true` for adapter builtins (Claude Code's `Bash`,
 * Codex's `shell`), false/undefined for host tools — and is passed through
 * to the AI SDK part by `parseToolCall`.
 */
export async function validateToolCall<TOOLS extends ToolSet>(args: {
  event: Extract<HarnessV1StreamPart, { type: 'tool-call' }>;
  tools: TOOLS;
}): Promise<TextStreamPart<TOOLS>> {
  const { event, tools } = args;
  const toolCall: LanguageModelV4ToolCall = {
    type: 'tool-call',
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    input: event.input,
    ...(event.providerExecuted !== undefined
      ? { providerExecuted: event.providerExecuted }
      : {}),
    ...(event.providerMetadata !== undefined
      ? { providerMetadata: event.providerMetadata }
      : {}),
  };

  const parsed = await parseToolCall<TOOLS>({
    toolCall,
    tools,
    repairToolCall: undefined,
    refineToolInput: undefined,
    instructions: undefined,
    messages: [],
  });

  return parsed as TextStreamPart<TOOLS>;
}

/** Best-effort plain text of the turn's prompt, for telemetry input messages. */
function promptToText(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') return prompt;
  const content = (prompt as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: 'text'; text: string } =>
          typeof part === 'object' &&
          part != null &&
          (part as { type?: unknown }).type === 'text',
      )
      .map(part => part.text)
      .join('');
  }
  return '';
}

// keep import bound so unused-but-needed type stays cited
export type _ContentPartMarker<T extends ToolSet> = ContentPart<T>;
