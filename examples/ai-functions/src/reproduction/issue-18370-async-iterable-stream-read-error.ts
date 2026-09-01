import { pathToFileURL } from 'node:url';
import path from 'node:path';

type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>;

type Settlement<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

type CreateAsyncIterableStream = <T>(
  source: ReadableStream<T>,
) => AsyncIterableStream<T>;

async function settle<T>(promise: Promise<T>): Promise<Settlement<T>> {
  return promise.then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason }),
  );
}

async function runScenario({
  name,
  sourceError,
  pendingReadCount,
  createAsyncIterableStream,
}: {
  name: string;
  sourceError: unknown;
  pendingReadCount: number;
  createAsyncIterableStream: CreateAsyncIterableStream;
}) {
  let controller!: ReadableStreamDefaultController<string>;
  let cancelCalls = 0;

  const stream = createAsyncIterableStream(
    new ReadableStream<string>({
      start(controllerParameter) {
        controller = controllerParameter;
      },
      cancel() {
        cancelCalls++;
      },
    }),
  );

  const iterator = stream[Symbol.asyncIterator]();
  const pendingReads = Array.from({ length: pendingReadCount }, () =>
    settle(iterator.next()),
  );

  controller.error(sourceError);

  const failedReads = await Promise.all(pendingReads);
  const lockedAfterError = stream.locked;
  const laterNext = await settle(iterator.next());

  let getReaderError: unknown;
  try {
    const reader = stream.getReader();
    void reader.closed.catch(() => {});
    reader.releaseLock();
  } catch (error) {
    getReaderError = error;
  }

  const iteratorReturn =
    iterator.return == null
      ? undefined
      : await settle(iterator.return()).catch(reason => ({
          status: 'rejected' as const,
          reason,
        }));

  return {
    name,
    failedReads: failedReads.map(result => ({
      status: result.status,
      preservedSourceError:
        result.status === 'rejected' && result.reason === sourceError,
    })),
    lockedAfterError,
    laterNext:
      laterNext.status === 'fulfilled'
        ? laterNext
        : {
            status: laterNext.status,
            preservedSourceError: laterNext.reason === sourceError,
          },
    getReaderError:
      getReaderError instanceof Error
        ? `${getReaderError.name}: ${getReaderError.message}`
        : getReaderError,
    iteratorReturn:
      iteratorReturn?.status === 'fulfilled'
        ? iteratorReturn
        : {
            status: iteratorReturn?.status,
            preservedSourceError: iteratorReturn?.reason === sourceError,
          },
    cancelCalls,
  };
}

async function main() {
  const moduleUrl = pathToFileURL(
    path.resolve(
      process.cwd(),
      '../../packages/ai/src/util/async-iterable-stream.ts',
    ),
  );
  const { createAsyncIterableStream } = (await import(moduleUrl.href)) as {
    createAsyncIterableStream: CreateAsyncIterableStream;
  };

  const scenarios = await Promise.all([
    runScenario({
      name: 'exact source error',
      sourceError: new Error('source failed'),
      pendingReadCount: 1,
      createAsyncIterableStream,
    }),
    runScenario({
      name: 'undefined source error',
      sourceError: undefined,
      pendingReadCount: 1,
      createAsyncIterableStream,
    }),
    runScenario({
      name: 'concurrent pending reads',
      sourceError: new Error('concurrent source failed'),
      pendingReadCount: 2,
      createAsyncIterableStream,
    }),
  ]);

  console.log(JSON.stringify(scenarios, null, 2));

  const sourceErrorsWerePreserved = scenarios.every(scenario =>
    scenario.failedReads.every(
      read => read.status === 'rejected' && read.preservedSourceError,
    ),
  );
  const cleanupFailed = scenarios.some(
    scenario =>
      scenario.lockedAfterError ||
      scenario.getReaderError != null ||
      scenario.laterNext.status !== 'fulfilled' ||
      scenario.laterNext.value.done !== true ||
      scenario.iteratorReturn?.status !== 'fulfilled' ||
      scenario.iteratorReturn.value.done !== true,
  );

  if (sourceErrorsWerePreserved && cleanupFailed) {
    throw new Error(
      'ISSUE #18370 REPRODUCED: source errors left AsyncIterableStream locked and the iterator unfinished.',
    );
  }

  if (!sourceErrorsWerePreserved) {
    throw new Error('The source error was not preserved by the failed read.');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
