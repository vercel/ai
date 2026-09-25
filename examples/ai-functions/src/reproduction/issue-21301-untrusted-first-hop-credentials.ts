import { fetchWithValidatedRedirects } from '@ai-sdk/provider-utils';

async function main() {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; headers: Headers }> = [];

  globalThis.fetch = async (input, init) => {
    requests.push({
      url: input.toString(),
      headers: new Headers(init?.headers),
    });

    return requests.length === 1
      ? new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.example.net/file' },
        })
      : new Response('file contents');
  };

  try {
    await fetchWithValidatedRedirects({
      url: 'https://untrusted.example/download',
      headers: {
        authorization: 'Bearer provider-secret',
        'x-key': 'custom-provider-secret',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  if (requests.length !== 2) {
    throw new Error(`Expected two requests, received ${requests.length}.`);
  }

  const leakedHeaders = ['authorization', 'x-key'].filter(name =>
    requests[0].headers.has(name),
  );

  if (leakedHeaders.length > 0) {
    throw new Error(
      `BUG REPRODUCED: untrusted first hop received credential headers: ${leakedHeaders.join(
        ', ',
      )}`,
    );
  }

  console.log('Credential headers were withheld from the untrusted first hop.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
