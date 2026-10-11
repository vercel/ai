const OUTPUT_BUFFER_HIGH_WATER_MARK = 64 * 1024;

export type SandboxProcessOutput = {
  stream: ReadableStream<Uint8Array>;
  write(chunk: Uint8Array): Promise<void>;
  close(): void;
  error(error: unknown): void;
};

export function createSandboxProcessOutput(): SandboxProcessOutput {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  let ended = false;
  let notifyCapacity: (() => void) | undefined;

  const notifyCapacityAvailable = () => {
    const notify = notifyCapacity;
    notifyCapacity = undefined;
    notify?.();
  };

  const stream = new ReadableStream<Uint8Array>(
    {
      start(value) {
        controller = value;
      },
      pull() {
        notifyCapacityAvailable();
      },
      cancel() {
        cancelled = true;
        notifyCapacityAvailable();
      },
    },
    {
      highWaterMark: OUTPUT_BUFFER_HIGH_WATER_MARK,
      size: chunk => chunk.byteLength,
    },
  );

  return {
    stream,
    async write(chunk) {
      if (!cancelled && !ended && (controller.desiredSize ?? 0) <= 0) {
        await new Promise<void>(resolve => {
          notifyCapacity = resolve;
        });
      }

      if (!cancelled && !ended) {
        controller.enqueue(chunk);
      }
    },
    close() {
      if (cancelled || ended) return;
      ended = true;
      notifyCapacityAvailable();
      controller.close();
    },
    error(error) {
      if (cancelled || ended) return;
      ended = true;
      notifyCapacityAvailable();
      controller.error(error);
    },
  };
}
