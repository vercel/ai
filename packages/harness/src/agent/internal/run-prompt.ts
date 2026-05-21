import type {
  HarnessV1,
  HarnessV1Options,
  HarnessV1Prompt,
  HarnessV1PromptControl,
  HarnessV1Sandbox,
  HarnessV1Session,
  HarnessV1ToolSpec,
} from '../../v1';
import { toHarnessStream } from './to-harness-stream';
import {
  safeParseJSON,
  type Context,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type { ContentPart } from 'ai';
import { HarnessStreamTextResult } from './harness-stream-text-result';
import { translateStreamPart } from './translate-stream-part';

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
  sandbox: HarnessV1Sandbox | undefined;
  harnessOptions: HarnessV1Options | undefined;
  runtimeContext: RUNTIME_CONTEXT;
  abortSignal: AbortSignal | undefined;
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

  const done = (async () => {
    let bridge: Awaited<ReturnType<typeof toHarnessStream>>;
    try {
      bridge = await toHarnessStream({
        session: input.session,
        prompt: input.prompt,
        tools: input.toolSpecs,
        instructions: input.instructions,
        harnessOptions: input.harnessOptions,
        abortSignal: input.abortSignal,
      });
    } catch (err) {
      result.fail(err);
      return;
    }

    const { stream, control } = bridge;
    const reader = stream.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value == null) continue;

        // Forward to consumer as soon as possible.
        const translated = translateStreamPart<TOOLS>(value);
        if (translated != null) result.enqueue(translated);

        // Drive step boundaries.
        if (value.type === 'finish-step') {
          result.finishStep({
            finishReason: value.finishReason,
            usage: value.usage,
            providerMetadata: value.harnessMetadata,
            warnings: [],
          });
        }

        // Execute host-side tools when the harness asks for one.
        if (value.type === 'tool-call' && !value.observeOnly) {
          await maybeExecuteHostTool({
            event: value,
            tools: input.tools,
            sandbox: input.sandbox,
            abortSignal: input.abortSignal,
            control,
          });
        }

        if (value.type === 'error') {
          result.fail(value.error);
          return;
        }
      }
      await result.finish();
    } catch (err) {
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

async function maybeExecuteHostTool<TOOLS extends ToolSet>(input: {
  event: { toolCallId: string; toolName: string; input: string };
  tools: TOOLS;
  sandbox: HarnessV1Sandbox | undefined;
  abortSignal: AbortSignal | undefined;
  control: HarnessV1PromptControl;
}): Promise<void> {
  const tool = (input.tools as Record<string, unknown>)[input.event.toolName] as
    | {
        execute?: (
          args: unknown,
          options: {
            abortSignal?: AbortSignal;
            experimental_sandbox?: HarnessV1Sandbox;
          },
        ) => unknown | Promise<unknown>;
      }
    | undefined;

  if (tool?.execute == null) return;

  const parsed = await safeParseJSON({ text: input.event.input });
  const args = parsed.success ? parsed.value : input.event.input;

  try {
    const output = await tool.execute(args, {
      abortSignal: input.abortSignal,
      experimental_sandbox: input.sandbox,
    });
    await input.control.submitToolResult({
      toolCallId: input.event.toolCallId,
      output,
    });
  } catch (err) {
    await input.control.submitToolResult({
      toolCallId: input.event.toolCallId,
      output: { error: String(err) },
      isError: true,
    });
  }
}

// keep import bound so unused-but-needed type stays cited
export type _ContentPartMarker<T extends ToolSet> = ContentPart<T>;
