import { fetchWithValidatedRedirects } from '@ai-sdk/provider-utils';

async function main() {
  const requests: Array<{ url: string; headers: Headers }> = [];

  await fetchWithValidatedRedirects({
    url: 'https://untrusted.example/download',
    headers: {
      authorization: 'Bearer provider-secret',
      'x-key': 'custom-provider-secret',
    },
    fetch: async (url, init) => {
      requests.push({
        url: url.toString(),
        headers: new Headers(init?.headers),
      });

      return requests.length === 1
        ? new Response(null, {
            status: 302,
            headers: { location: 'https://cdn.example.net/file' },
          })
        : new Response('file contents');
    },
  });

  if (requests.length !== 2) {
    throw new Error(`Expected two requests, received ${requests.length}.`);
  }

  const firstHop = requests[0];
  const secondHop = requests[1];

  if (
    secondHop.headers.has('authorization') ||
    secondHop.headers.has('x-key')
  ) {
    throw new Error(
      'Cross-origin redirect unexpectedly retained credential headers.',
    );
  }

  const leakedHeaders = ['authorization', 'x-key'].filter(name =>
    firstHop.headers.has(name),
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
