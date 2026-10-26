import type {
  HarnessV1,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import type { ToolSet } from 'ai';

export type HarnessStreamStartPart = Extract<
  HarnessV1StreamPart,
  { type: 'stream-start' }
>;

/**
 * Wraps a harness so that every `stream-start` part its sessions emit is
 * recorded before being forwarded unchanged. `HarnessAgent` consumes
 * `stream-start` internally, so this is the only place an example can observe
 * the adapter-reported `modelId`.
 */
export function captureHarnessStreamStarts<HARNESS extends HarnessV1<ToolSet>>({
  harness,
}: {
  harness: HARNESS;
}): {
  harness: HARNESS;
  streamStarts: ReadonlyArray<HarnessStreamStartPart>;
} {
  const streamStarts: HarnessStreamStartPart[] = [];

  const wrapEmit =
    (emit: (part: HarnessV1StreamPart) => void) =>
    (part: HarnessV1StreamPart) => {
      if (part.type === 'stream-start') streamStarts.push(part);
      emit(part);
    };

  const wrapSession = (session: HarnessV1Session): HarnessV1Session =>
    new Proxy(session, {
      get(target, property, receiver) {
        if (property === 'doPromptTurn') {
          return (options: Parameters<HarnessV1Session['doPromptTurn']>[0]) =>
            target.doPromptTurn({ ...options, emit: wrapEmit(options.emit) });
        }
        if (property === 'doContinueTurn') {
          return (options: Parameters<HarnessV1Session['doContinueTurn']>[0]) =>
            target.doContinueTurn({
              ...options,
              emit: wrapEmit(options.emit),
            });
        }
        return Reflect.get(target, property, receiver);
      },
    });

  const wrappedHarness = new Proxy(harness, {
    get(target, property, receiver) {
      if (property === 'doStart') {
        return async (options: Parameters<HARNESS['doStart']>[0]) =>
          wrapSession(await target.doStart(options));
      }
      return Reflect.get(target, property, receiver);
    },
  });

  return { harness: wrappedHarness, streamStarts };
}
