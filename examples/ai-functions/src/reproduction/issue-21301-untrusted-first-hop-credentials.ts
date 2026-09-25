import { fetchWithValidatedRedirects } from '../../../../packages/provider-utils/src/fetch-with-validated-redirects';

const FIRST_HOP_URL = 'https://attacker.example/file';
const REDIRECT_URL = 'https://cdn.example/file';
const AUTHORIZATION = 'Bearer provider-secret';
const CUSTOM_API_KEY = 'custom-provider-secret';
const FAILURE_SIGNAL =
  'ISSUE_21301: untrusted first hop received credential headers';

type CapturedRequest = {
  url: string;
  headers: Headers;
};

async function main() {
  const originalFetch = globalThis.fetch;
  const requests: CapturedRequest[] = [];

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    requests.push({
      url,
      headers: new Headers(init?.headers),
    });

    return requests.length === 1
      ? new Response(null, {
          status: 302,
          headers: { location: REDIRECT_URL },
        })
      : new Response('ok', { status: 200 });
  };

  try {
    await fetchWithValidatedRedirects({
      url: FIRST_HOP_URL,
      headers: {
        Authorization: AUTHORIZATION,
        'x-key': CUSTOM_API_KEY,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const firstHop = requests.find(request => request.url === FIRST_HOP_URL);
  if (firstHop == null) {
    throw new Error('Reproduction setup failed: first hop was not requested');
  }

  const firstHopCredentials = [
    firstHop.headers.has('authorization') ? 'authorization' : undefined,
    firstHop.headers.has('x-key') ? 'x-key' : undefined,
  ].filter((name): name is string => name != null);

  const redirectHop = requests.find(request => request.url === REDIRECT_URL);
  const redirectCredentials =
    redirectHop == null
      ? []
      : [
          redirectHop.headers.has('authorization')
            ? 'authorization'
            : undefined,
          redirectHop.headers.has('x-key') ? 'x-key' : undefined,
        ].filter((name): name is string => name != null);

  console.error(
    `Captured credential headers: first-hop=[${firstHopCredentials.join(
      ',',
    )}] redirect-hop=[${redirectCredentials.join(',')}]`,
  );

  if (firstHopCredentials.length > 0) {
    throw new Error(`${FAILURE_SIGNAL}: ${firstHopCredentials.join(',')}`);
  }

  if (redirectCredentials.length > 0) {
    throw new Error(
      `ISSUE_21301: cross-origin redirect received credential headers: ${redirectCredentials.join(
        ',',
      )}`,
    );
  }

  console.log('Credential headers were withheld from untrusted origins.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
