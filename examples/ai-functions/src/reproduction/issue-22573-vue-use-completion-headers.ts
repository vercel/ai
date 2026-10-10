import assert from 'node:assert/strict';

const failureSignal =
  'ISSUE_22573: Vue useCompletion dropped Headers entries from the request';

class ReproducedBugError extends Error {}

type HeaderInput = Headers | Record<string, string>;

type CompletionResult = {
  complete: (
    prompt: string,
    options?: { headers?: HeaderInput },
  ) => Promise<string | null | undefined>;
  completion: { value: string };
};

async function main() {
  // Resolve both public packages from @ai-sdk/vue so this example does not
  // require adding Vue-only dependencies to the ai-functions package.
  const vuePackageRoot = new URL('../../../../packages/vue/', import.meta.url);
  const [{ useCompletion }, { effectScope }] = await Promise.all([
    import(new URL('dist/index.js', vuePackageRoot).href),
    import(new URL('node_modules/vue/index.mjs', vuePackageRoot).href),
  ]);

  async function send({
    id,
    hookHeaders,
    requestHeaders,
  }: {
    id: string;
    hookHeaders: HeaderInput;
    requestHeaders: HeaderInput;
  }) {
    const seen: Array<Record<string, string>> = [];
    const scope = effectScope();

    try {
      const completion = scope.run(() =>
        useCompletion({
          id,
          api: '/mock-completion',
          headers: hookHeaders,
          streamProtocol: 'text',
          fetch: async (_url: unknown, init: RequestInit | undefined) => {
            seen.push(Object.fromEntries(new Headers(init?.headers)));
            return new Response('ok');
          },
        }),
      ) as CompletionResult | undefined;

      assert.ok(completion, `${id}: useCompletion returned no result`);
      await completion.complete('hello', { headers: requestHeaders });
      assert.equal(
        completion.completion.value,
        'ok',
        `${id}: completion did not finish successfully`,
      );
      assert.equal(seen.length, 1, `${id}: expected one fetch request`);
      return seen[0];
    } finally {
      scope.stop();
    }
  }

  const recordHeaders = await send({
    id: 'issue-22573-record-control',
    hookHeaders: {
      'X-Project': 'project-a',
      'X-Shared': 'hook',
    },
    requestHeaders: {
      'X-Request': 'request-b',
      'X-Shared': 'request',
    },
  });

  assert.deepEqual(
    {
      project: recordHeaders['x-project'],
      request: recordHeaders['x-request'],
      shared: recordHeaders['x-shared'],
    },
    {
      project: 'project-a',
      request: 'request-b',
      shared: 'request',
    },
    'plain-record header control must work',
  );

  const headersInstance = await send({
    id: 'issue-22573-headers-instance',
    hookHeaders: new Headers({
      'X-Project': 'project-a',
      'X-Shared': 'hook',
    }),
    requestHeaders: new Headers({
      'X-Request': 'request-b',
      'X-Shared': 'request',
    }),
  });

  try {
    assert.deepEqual(
      {
        project: headersInstance['x-project'],
        request: headersInstance['x-request'],
        shared: headersInstance['x-shared'],
      },
      {
        project: 'project-a',
        request: 'request-b',
        shared: 'request',
      },
    );
  } catch (cause) {
    throw new ReproducedBugError(
      `${failureSignal}; observed ${JSON.stringify(headersInstance)}`,
      { cause },
    );
  }

  console.log('Issue #22573 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
