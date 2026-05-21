import type {
  HarnessV1PromptControl,
  HarnessV1PromptOptions,
} from '../../v1/harness-v1-call-options';
import type { HarnessV1Session } from '../../v1/harness-v1-session';
import type { HarnessV1StreamPart } from '../../v1/harness-v1-stream-part';

/**
 * Bridge an adapter's emit-based event surface into a pull-based
 * `ReadableStream<HarnessV1StreamPart>`.
 *
 * Adapters implement `doPrompt` against an `emit` callback because that is
 * the natural shape when wrapping an SDK that itself produces events.
 * Consumers (notably `HarnessAgent`) prefer a stream because that is the
 * idiomatic AI SDK shape. This helper converts the former into the latter.
 *
 * Lifetime:
 *   1. Calls `session.doPrompt({ ..., emit })` immediately.
 *   2. Every `emit(part)` becomes a stream chunk.
 *   3. When `control.done` resolves, the stream closes.
 *   4. When `control.done` rejects, an `{ type: 'error', error }` part is
 *      enqueued and the stream is then closed normally. The rejection is
 *      surfaced to consumers as a discriminated-union event rather than as
 *      a stream error so iteration code does not need a separate try/catch
 *      around the consumer loop.
 *   5. The supplied `abortSignal` (if any) aborts the underlying turn and
 *      closes the stream.
 *
 * The returned `control` is the same object `session.doPrompt` produced and
 * is intended for use by the consumer to submit tool results / approvals /
 * user messages back into the in-flight turn.
 */
export async function toHarnessStream(options: {
  session: HarnessV1Session;
  prompt: HarnessV1PromptOptions['prompt'];
  tools?: HarnessV1PromptOptions['tools'];
  instructions?: HarnessV1PromptOptions['instructions'];
  activeBuiltinTools?: HarnessV1PromptOptions['activeBuiltinTools'];
  harnessOptions?: HarnessV1PromptOptions['harnessOptions'];
  abortSignal?: AbortSignal;
}): Promise<{
  stream: ReadableStream<HarnessV1StreamPart>;
  control: HarnessV1PromptControl;
}> {
  let controller!: ReadableStreamDefaultController<HarnessV1StreamPart>;
  let closed = false;

  const stream = new ReadableStream<HarnessV1StreamPart>({
    start(c) {
      controller = c;
    },
  });

  const safeEnqueue = (part: HarnessV1StreamPart) => {
    if (closed) return;
    controller.enqueue(part);
  };

  const safeClose = () => {
    if (closed) return;
    closed = true;
    controller.close();
  };

  const control = await options.session.doPrompt({
    prompt: options.prompt,
    tools: options.tools,
    instructions: options.instructions,
    activeBuiltinTools: options.activeBuiltinTools,
    harnessOptions: options.harnessOptions,
    abortSignal: options.abortSignal,
    emit: safeEnqueue,
  });

  Promise.resolve(control.done)
    .then(
      () => safeClose(),
      (err: unknown) => {
        safeEnqueue({ type: 'error', error: err });
        safeClose();
      },
    )
    // Belt-and-suspenders: any throw inside the handlers themselves should
    // not become an unhandled rejection.
    .catch(() => {});

  return { stream, control };
}
