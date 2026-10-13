import { smoothStream } from 'ai';

type Chunking = RegExp | ((buffer: string) => string | null | undefined);

type CollectionResult = {
  emitted: string[];
  capped: boolean;
  errorMessage: string | undefined;
};

async function collect(
  chunking: Chunking,
  deltas: string[],
  cap = 20,
): Promise<CollectionResult> {
  const emitted: string[] = [];
  let capped = false;
  let streamError: unknown;

  const transform = smoothStream({
    delayInMs: null,
    chunking,
    _internal: { delay: async () => {} },
  })({ tools: {} });
  const reader = transform.readable.getReader();
  const writer = transform.writable.getWriter();

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
          await reader.cancel();
          return;
        }
      }
    } catch (error) {
      streamError ??= error;
    }
  })();

  const feed = (async () => {
    try {
      for (const text of deltas) {
        await writer.write({ type: 'text-delta', id: '1', text });
      }

      await writer.write({ type: 'text-end', id: '1' });
      await writer.close();
    } catch (error) {
      streamError ??= error;
    }
  })();

  await Promise.all([pump, feed]);

  return {
    emitted,
    capped,
    errorMessage:
      streamError instanceof Error ? streamError.message : undefined,
  };
}

async function main() {
  const text = 'alpha beta gamma delta ';
  const expectedChunks = ['alpha ', 'beta ', 'gamma ', 'delta '];
  const globalRegex = /\S+\s+/gm;
  const stickyRegex = /\S+\s+/my;

  const nonStateful = await collect(/\S+\s+/m, [text]);
  const global = await collect(globalRegex, [text]);
  const sticky = await collect(stickyRegex, [text]);
  const zeroLengthRegex = await collect(/\S*/m, ['hello'], 8);
  const zeroLengthCallback = await collect(
    buffer => (/\S*/m.exec(buffer) ?? [null])[0],
    ['hello'],
    8,
  );

  const observed = {
    expectedChunks,
    nonStateful,
    global: {
      ...global,
      finalLastIndex: globalRegex.lastIndex,
    },
    sticky: {
      ...sticky,
      finalLastIndex: stickyRegex.lastIndex,
    },
    zeroLengthRegex,
    zeroLengthCallback,
  };

  console.log(JSON.stringify(observed, null, 2));

  if (JSON.stringify(nonStateful.emitted) !== JSON.stringify(expectedChunks)) {
    throw new Error(
      `Reproduction precondition failed: the non-stateful control emitted ${JSON.stringify(nonStateful.emitted)}.`,
    );
  }

  if (
    zeroLengthCallback.capped ||
    zeroLengthCallback.errorMessage !==
      'Chunking function must return a non-empty string.'
  ) {
    throw new Error(
      `Reproduction precondition failed: the callback control did not reject its empty match. Observed ${JSON.stringify(zeroLengthCallback)}.`,
    );
  }

  const boundaryMismatch =
    JSON.stringify(global.emitted) !== JSON.stringify(expectedChunks) ||
    JSON.stringify(sticky.emitted) !== JSON.stringify(expectedChunks);
  const zeroLengthWasNotRejected =
    zeroLengthRegex.capped ||
    zeroLengthRegex.errorMessage == null ||
    !/(?:non-empty|empty|zero-length)/i.test(zeroLengthRegex.errorMessage);

  if (boundaryMismatch || zeroLengthWasNotRejected) {
    throw new Error(
      'ISSUE_19914_REPRODUCED: smoothStream custom RegExp chunking produced incorrect boundaries or failed to reject a zero-length match.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
