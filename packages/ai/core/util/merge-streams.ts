/**
 * Merges two readable streams into a single readable stream, emitting values
 * from each stream as they become available.
 *
 * The first stream is prioritized over the second stream. If both streams have
 * values available, the first stream's value is emitted first.
 *
 * @template VALUE1 - The type of values emitted by the first stream.
 * @template VALUE2 - The type of values emitted by the second stream.
 * @param {ReadableStream<VALUE1>} stream1 - The first readable stream.
 * @param {ReadableStream<VALUE2>} stream2 - The second readable stream.
 * @returns {ReadableStream<VALUE1 | VALUE2>} A new readable stream that emits values from both input streams.
 */
export function mergeStreams<VALUE1, VALUE2>(
  stream1: ReadableStream<VALUE1>,
  stream2: ReadableStream<VALUE2>,
): ReadableStream<VALUE1 | VALUE2> {
  const reader1 = stream1.getReader();
  const reader2 = stream2.getReader();

  let lastRead1: Promise<ReadableStreamReadResult<VALUE1>> | undefined =
    undefined;
  let lastRead2: Promise<ReadableStreamReadResult<VALUE2>> | undefined =
    undefined;

  let stream1Done = false;
  let stream2Done = false;

  // only use when stream 2 is done:
  async function readStream1(
    controller: ReadableStreamDefaultController<VALUE1 | VALUE2>,
  ) {
    try {
      if (lastRead1 == null) {
        lastRead1 = reader1.read();
      }

      const result = await lastRead1;
      lastRead1 = undefined;

      if (!result.done) {
        controller.enqueue(result.value);
      } else {
        controller.close();
      }
    } catch (error) {
      controller.error(error);
    }
  }

  // only use when stream 1 is done:
  async function readStream2(
    controller: ReadableStreamDefaultController<VALUE1 | VALUE2>,
  ) {
    try {
      if (lastRead2 == null) {
        lastRead2 = reader2.read();
      }

      const result = await lastRead2;
      lastRead2 = undefined;

      if (!result.done) {
        controller.enqueue(result.value);
      } else {
        controller.close();
      }
    } catch (error) {
      controller.error(error);
    }
  }

  return new ReadableStream<VALUE1 | VALUE2>({
    async pull(controller) {
      try {
        // stream 1 is done, we can only read from stream 2:
        if (stream1Done) {
          await readStream2(controller);
          return;
        }

        // stream 2 is done, we can only read from stream 1:
        if (stream2Done) {
          await readStream1(controller);
          return;
        }

        // pull the next value from the stream that was read last:
        if (lastRead1 == null) {
          lastRead1 = reader1.read();
        }
        if (lastRead2 == null) {
          lastRead2 = reader2.read();
        }

        // Note on Promise.race (prioritizing stream 1 over stream 2):
        // If the iterable contains one or more non-promise values and/or an already settled promise,
        // then Promise.race() will settle to the first of these values found in the iterable.
        const { result, reader } = await Promise.race([
          lastRead1.then(result => ({ result, reader: reader1 })),
          lastRead2.then(result => ({ result, reader: reader2 })),
        ]);

        if (!result.done) {
          controller.enqueue(result.value);
        }

        if (reader === reader1) {
          lastRead1 = undefined;
          if (result.done) {
            // stream 1 is done, we can only read from stream 2:
            await readStream2(controller);
            stream1Done = true;
          }
        } else {
          lastRead2 = undefined;
          // stream 2 is done, we can only read from stream 1:
          if (result.done) {
            stream2Done = true;
            await readStream1(controller);
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      reader1.cancel();
      reader2.cancel();
    },
  });
}
