import { toUIMessageStream } from '@ai-sdk/langchain';
import assert from 'node:assert/strict';

const reproducedSignal =
  'ISSUE #22801 REPRODUCED: empty successful sources omitted the requested finish chunk';

async function* emptyAsyncIterable(): AsyncGenerator<never> {}

function emptyReadableStream(): ReadableStream<never> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

async function collectTypes(
  stream: ReadableStream<{ type: string }>,
): Promise<string[]> {
  const types: string[] = [];
  for await (const part of stream) {
    types.push(part.type);
  }
  return types;
}

async function checkSuccessfulEmptySource(
  label: string,
  source: AsyncIterable<never> | ReadableStream<never>,
): Promise<boolean> {
  let finished = false;
  const types = await collectTypes(
    toUIMessageStream(source, {
      sendFinish: true,
      onFinish: () => {
        finished = true;
      },
    }),
  );

  assert.equal(finished, true, `${label}: onFinish was not called`);

  if (types.length === 1 && types[0] === 'start') {
    return true;
  }

  assert.deepEqual(
    types,
    ['start', 'finish'],
    `${label}: unexpected successful lifecycle chunks`,
  );
  return false;
}

async function checkSendFinishFalseControl(): Promise<void> {
  let finished = false;
  const types = await collectTypes(
    toUIMessageStream(emptyAsyncIterable(), {
      sendFinish: false,
      onFinish: () => {
        finished = true;
      },
    }),
  );

  assert.equal(finished, true);
  assert.deepEqual(types, ['start']);
}

async function checkErrorControl(): Promise<void> {
  const errorSource: AsyncIterable<never> = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          throw new Error('fixture failure');
        },
      };
    },
  };

  let errored = false;
  let finished = false;
  const types = await collectTypes(
    toUIMessageStream(errorSource, {
      sendFinish: true,
      onError: error => {
        assert.equal(error.message, 'fixture failure');
        errored = true;
      },
      onFinish: () => {
        finished = true;
      },
    }),
  );

  assert.equal(errored, true);
  assert.equal(finished, false);
  assert.deepEqual(types, ['start', 'error']);
}

async function checkCancellationControl(): Promise<void> {
  let releaseSource!: () => void;
  const source = {
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          new Promise<IteratorResult<never>>(resolve => {
            releaseSource = () => resolve({ done: true, value: undefined });
          }),
      };
    },
  };

  const reader = toUIMessageStream(source, { sendFinish: true }).getReader();
  assert.deepEqual(await reader.read(), {
    done: false,
    value: { type: 'start' },
  });

  const cancellation = reader.cancel('fixture cancellation');
  releaseSource();
  await cancellation;
  assert.deepEqual(await reader.read(), { done: true, value: undefined });
}

async function main(): Promise<void> {
  await checkSendFinishFalseControl();
  await checkErrorControl();
  await checkCancellationControl();

  const missingFinishSources: string[] = [];
  if (
    await checkSuccessfulEmptySource(
      'empty async iterable',
      emptyAsyncIterable(),
    )
  ) {
    missingFinishSources.push('empty async iterable');
  }
  if (
    await checkSuccessfulEmptySource(
      'empty ReadableStream',
      emptyReadableStream(),
    )
  ) {
    missingFinishSources.push('empty ReadableStream');
  }

  if (missingFinishSources.length > 0) {
    assert.deepEqual(missingFinishSources, [
      'empty async iterable',
      'empty ReadableStream',
    ]);
    console.error(
      `${reproducedSignal}; observed only ["start"] for ${missingFinishSources.join(
        ' and ',
      )}, while onFinish ran`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #22801 is not reproduced: both empty successful sources emitted ["start","finish"].',
  );
}

main().catch(error => {
  console.error('REPRODUCTION HARNESS ERROR');
  console.error(error);
  process.exitCode = 2;
});
