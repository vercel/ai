import { smoothStream } from 'ai';

type SmoothStreamOptions = NonNullable<Parameters<typeof smoothStream>[0]>;
type Chunking = SmoothStreamOptions['chunking'];

type CollectionResult = {
  emitted: string[];
  capped: boolean;
  errorMessage?: string;
};

async function collect(
  chunking: Chunking,
  text: string,
  cap = 20,
): Promise<CollectionResult> {
  const emitted: string[] = [];
  let capped = false;
  let errorMessage: string | undefined;

  let transform: ReturnType<ReturnType<typeof smoothStream>>;

  try {
    transform = smoothStream({
      chunking,
      delayInMs: null,
      _internal: { delay: async () => {} },
    })({ tools: {} });
  } catch (error) {
    return {
      emitted,
      capped,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  const reader = transform.readable.getReader();
  const writer = transform.writable.getWriter();

  const recordError = (error: unknown) => {
    errorMessage ??= error instanceof Error ? error.message : String(error);
  };

  const pump = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          return;
        }

        if (value.type === 'text-delta') {
          emitted.push(value.text);
        }

        if (emitted.length >= cap) {
          capped = true;
          await reader.cancel('reproduction emission cap reached');
          return;
        }
      }
    } catch (error) {
      recordError(error);
    }
  })();

  const feed = (async () => {
    try {
      await writer.write({ type: 'text-delta', id: '1', text });
      await writer.write({ type: 'text-end', id: '1' });
      await writer.close();
    } catch (error) {
      recordError(error);
    }
  })();

  await Promise.all([pump, feed]);

  return { emitted, capped, errorMessage };
}

function sameChunks(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((chunk, index) => chunk === expected[index])
  );
}

async function main() {
  const text = 'alpha beta gamma delta ';
  const expectedChunks = ['alpha ', 'beta ', 'gamma ', 'delta '];

  const baseline = await collect(/\S+\s+/m, text);
  const global = await collect(/\S+\s+/gm, text);
  const sticky = await collect(/\S+\s+/my, text);
  const zeroLength = await collect(/\S*/m, 'hello');
  const callback = await collect(buffer => /\S*/m.exec(buffer)?.[0], 'hello');

  console.log(
    JSON.stringify(
      {
        expectedChunks,
        baseline,
        global,
        sticky,
        zeroLength,
        callback,
      },
      null,
      2,
    ),
  );

  if (!sameChunks(baseline.emitted, expectedChunks)) {
    throw new Error(
      `REPRODUCTION HARNESS FAILURE: non-global baseline emitted ${JSON.stringify(baseline.emitted)}`,
    );
  }

  if (
    callback.capped ||
    callback.emitted.includes('') ||
    !/non-empty/i.test(callback.errorMessage ?? '')
  ) {
    throw new Error(
      `REPRODUCTION HARNESS FAILURE: callback chunk detector did not reject its empty match: ${JSON.stringify(callback)}`,
    );
  }

  const boundaryFailures = [
    ['global', global],
    ['sticky', sticky],
  ].filter(([, result]) => {
    const collection = result as CollectionResult;
    return !sameChunks(collection.emitted, expectedChunks);
  });

  const zeroLengthFailure =
    zeroLength.capped ||
    zeroLength.emitted.includes('') ||
    zeroLength.errorMessage == null;

  if (boundaryFailures.length > 0 || zeroLengthFailure) {
    throw new Error(
      'ISSUE #19914 REPRODUCED: smoothStream mishandles custom RegExp chunking',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
