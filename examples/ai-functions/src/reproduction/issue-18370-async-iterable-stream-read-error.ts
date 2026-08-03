import {
  asAsyncIterableStream,
  createAsyncIterableStream,
  type AsyncIterableStream,
} from '../../../../packages/ai/src/util/async-iterable-stream';

type StreamFactory = <T>(stream: ReadableStream<T>) => AsyncIterableStream<T>;

const factories: Array<{ name: string; create: StreamFactory }> = [
  {
    name: 'createAsyncIterableStream',
    create: createAsyncIterableStream,
  },
  {
    name: 'asAsyncIterableStream',
    create: asAsyncIterableStream,
  },
];

async function main() {
  const primaryFailures: string[] = [];
  const secondaryFailures: string[] = [];

  for (const factory of factories) {
    await checkExactSourceError(factory, primaryFailures, secondaryFailures);
    await checkUndefinedSourceError(
      factory,
      primaryFailures,
      secondaryFailures,
    );
    await checkConcurrentReads(factory, primaryFailures, secondaryFailures);
  }

  for (const failure of [...primaryFailures, ...secondaryFailures]) {
    console.error(`- ${failure}`);
  }

  if (primaryFailures.length > 0) {
    console.error(
      'ISSUE #18370 reproduced: AsyncIterableStream stays locked after source stream errors',
    );
    process.exitCode = 1;
    return;
  }

  if (secondaryFailures.length > 0) {
    console.error(
      'Issue #18370 primary lock failure was not observed, but related behavior differed',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #18370 not reproduced: all errored streams released their reader locks',
  );
}

async function checkExactSourceError(
  factory: { name: string; create: StreamFactory },
  primaryFailures: string[],
  secondaryFailures: string[],
) {
  const sourceError = { type: 'source-error' };
  let controller!: ReadableStreamDefaultController<string>;
  let cancelCalls = 0;

  const stream = factory.create(
    new ReadableStream<string>({
      start(controllerParam) {
        controller = controllerParam;
        controller.enqueue('chunk1');
      },
      cancel() {
        cancelCalls++;
      },
    }),
  );
  const iterator = stream[Symbol.asyncIterator]();

  const firstRead = await iterator.next();
  if (firstRead.done !== false || firstRead.value !== 'chunk1') {
    secondaryFailures.push(
      `${factory.name} did not return the queued chunk before the source error`,
    );
  }

  const failedRead = iterator.next();
  controller.error(sourceError);
  const failedOutcome = await settle(failedRead);

  if (
    failedOutcome.status !== 'rejected' ||
    failedOutcome.reason !== sourceError
  ) {
    secondaryFailures.push(
      `${factory.name} did not preserve the exact source error`,
    );
  }

  checkUnlocked(
    `${factory.name} exact-error scenario`,
    stream,
    primaryFailures,
  );

  if (cancelCalls !== 0) {
    secondaryFailures.push(
      `${factory.name} cancelled the errored source instead of only releasing the reader`,
    );
  }

  await checkLaterNextIsDone(
    `${factory.name} exact-error scenario`,
    iterator,
    secondaryFailures,
  );
  await checkReaderCanBeReacquired(
    `${factory.name} exact-error scenario`,
    stream,
    sourceError,
    primaryFailures,
    secondaryFailures,
  );
  await checkReturnIsDone(
    `${factory.name} exact-error scenario`,
    iterator,
    secondaryFailures,
  );
}

async function checkUndefinedSourceError(
  factory: { name: string; create: StreamFactory },
  primaryFailures: string[],
  secondaryFailures: string[],
) {
  let controller!: ReadableStreamDefaultController<string>;
  const stream = factory.create(
    new ReadableStream<string>({
      start(controllerParam) {
        controller = controllerParam;
      },
    }),
  );
  const iterator = stream[Symbol.asyncIterator]();
  const failedRead = iterator.next();

  controller.error(undefined);
  const failedOutcome = await settle(failedRead);

  if (
    failedOutcome.status !== 'rejected' ||
    failedOutcome.reason !== undefined
  ) {
    secondaryFailures.push(
      `${factory.name} did not preserve an undefined source error reason`,
    );
  }

  checkUnlocked(
    `${factory.name} undefined-error scenario`,
    stream,
    primaryFailures,
  );
  await checkLaterNextIsDone(
    `${factory.name} undefined-error scenario`,
    iterator,
    secondaryFailures,
  );

  await iterator.return?.().catch(() => {});
}

async function checkConcurrentReads(
  factory: { name: string; create: StreamFactory },
  primaryFailures: string[],
  secondaryFailures: string[],
) {
  const sourceError = new Error('source failed');
  let controller!: ReadableStreamDefaultController<string>;
  let cancelCalls = 0;

  const stream = factory.create(
    new ReadableStream<string>({
      start(controllerParam) {
        controller = controllerParam;
      },
      cancel() {
        cancelCalls++;
      },
    }),
  );
  const iterator = stream[Symbol.asyncIterator]();
  const firstRead = iterator.next();
  const secondRead = iterator.next();

  controller.error(sourceError);
  const outcomes = await Promise.allSettled([firstRead, secondRead]);

  if (
    outcomes.some(
      outcome =>
        outcome.status !== 'rejected' || outcome.reason !== sourceError,
    )
  ) {
    secondaryFailures.push(
      `${factory.name} did not reject both concurrent reads with the original source error`,
    );
  }

  checkUnlocked(
    `${factory.name} concurrent-read scenario`,
    stream,
    primaryFailures,
  );

  if (cancelCalls !== 0) {
    secondaryFailures.push(
      `${factory.name} cancelled the errored source during concurrent read cleanup`,
    );
  }

  await checkLaterNextIsDone(
    `${factory.name} concurrent-read scenario`,
    iterator,
    secondaryFailures,
  );

  await iterator.return?.().catch(() => {});
}

function checkUnlocked(
  scenario: string,
  stream: ReadableStream<unknown>,
  primaryFailures: string[],
) {
  if (stream.locked) {
    primaryFailures.push(`${scenario} left the stream locked`);
  }
}

async function checkReaderCanBeReacquired(
  scenario: string,
  stream: ReadableStream<unknown>,
  sourceError: unknown,
  primaryFailures: string[],
  secondaryFailures: string[],
) {
  let reader: ReadableStreamDefaultReader<unknown>;

  try {
    reader = stream.getReader();
  } catch {
    primaryFailures.push(`${scenario} prevented a subsequent getReader() call`);
    return;
  }

  const outcome = await settle(reader.read());
  if (outcome.status !== 'rejected' || outcome.reason !== sourceError) {
    secondaryFailures.push(
      `${scenario} did not remain errored with the original source error`,
    );
  }
  reader.releaseLock();
}

async function checkLaterNextIsDone<T>(
  scenario: string,
  iterator: AsyncIterator<T>,
  secondaryFailures: string[],
) {
  const outcome = await settle(iterator.next());

  if (outcome.status !== 'fulfilled' || outcome.value.done !== true) {
    secondaryFailures.push(
      `${scenario} did not return done: true from a later iterator.next() call`,
    );
  }
}

async function checkReturnIsDone<T>(
  scenario: string,
  iterator: AsyncIterator<T>,
  secondaryFailures: string[],
) {
  if (iterator.return == null) {
    secondaryFailures.push(`${scenario} did not provide iterator.return()`);
    return;
  }

  const outcome = await settle(iterator.return());

  if (outcome.status !== 'fulfilled' || outcome.value.done !== true) {
    secondaryFailures.push(
      `${scenario} did not return done: true from iterator.return() after the read error`,
    );
  }
}

function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason }),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
