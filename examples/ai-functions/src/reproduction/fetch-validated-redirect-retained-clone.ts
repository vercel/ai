import assert from 'node:assert/strict';
import { fetchWithValidatedRedirects } from '@ai-sdk/provider-utils';

const REDIRECT_STATUSES = [301, 302, 303, 307, 308] as const;
const START_URL = 'https://example.test/start';
const FINAL_URL = 'https://example.test/final';
const SETTLEMENT_WINDOW_MS = 100;

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function inputUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

async function retainedUnreadCloneScenario(status: number): Promise<{
  requestsBeforeCleanup: string[];
  stateBeforeCleanup: 'pending' | 'resolved';
}> {
  const requests: string[] = [];
  let retainedResponse: Response | undefined;
  let state: 'pending' | 'resolved' = 'pending';
  const entered = deferred();

  const fakeFetch: typeof fetch = async input => {
    const url = inputUrl(input);
    requests.push(url);

    if (url === START_URL) {
      const response = new Response('Moved', {
        status,
        headers: { location: FINAL_URL },
      });
      retainedResponse = response.clone();
      entered.resolve();
      return response;
    }

    return new Response('Synthetic file');
  };

  const download = fetchWithValidatedRedirects({
    url: START_URL,
    fetch: fakeFetch,
  }).then(response => {
    state = 'resolved';
    return response;
  });

  await entered.promise;
  await delay(SETTLEMENT_WINDOW_MS);

  const observed = {
    requestsBeforeCleanup: [...requests],
    stateBeforeCleanup: state,
  };

  assert.ok(
    retainedResponse,
    'the fetch wrapper did not retain a response clone',
  );
  await retainedResponse.arrayBuffer();
  const response = await download;
  assert.equal(await response.text(), 'Synthetic file');

  return observed;
}

async function redirectWithoutClone(status: number): Promise<void> {
  const requests: string[] = [];
  const fakeFetch: typeof fetch = async input => {
    const url = inputUrl(input);
    requests.push(url);
    return url === START_URL
      ? new Response('Moved', {
          status,
          headers: { location: FINAL_URL },
        })
      : new Response('Synthetic file');
  };

  const response = await fetchWithValidatedRedirects({
    url: START_URL,
    fetch: fakeFetch,
  });

  assert.deepEqual(requests, [START_URL, FINAL_URL]);
  assert.equal(await response.text(), 'Synthetic file');
}

async function redirectWithReadClone(): Promise<void> {
  const requests: string[] = [];
  const fakeFetch: typeof fetch = async input => {
    const url = inputUrl(input);
    requests.push(url);
    if (url !== START_URL) {
      return new Response('Synthetic file');
    }

    const response = new Response('Moved', {
      status: 302,
      headers: { location: FINAL_URL },
    });
    await response.clone().arrayBuffer();
    return response;
  };

  const response = await fetchWithValidatedRedirects({
    url: START_URL,
    fetch: fakeFetch,
  });

  assert.deepEqual(requests, [START_URL, FINAL_URL]);
  assert.equal(await response.text(), 'Synthetic file');
}

async function redirectWithCanceledClone(): Promise<void> {
  const requests: string[] = [];
  let cloneCancellation: Promise<void> | undefined;
  const fakeFetch: typeof fetch = async input => {
    const url = inputUrl(input);
    requests.push(url);
    if (url !== START_URL) {
      return new Response('Synthetic file');
    }

    const response = new Response('Moved', {
      status: 302,
      headers: { location: FINAL_URL },
    });
    cloneCancellation = response.clone().body?.cancel();
    return response;
  };

  const response = await fetchWithValidatedRedirects({
    url: START_URL,
    fetch: fakeFetch,
  });

  await cloneCancellation;
  assert.deepEqual(requests, [START_URL, FINAL_URL]);
  assert.equal(await response.text(), 'Synthetic file');
}

async function bodylessRedirectWithRetainedClone(): Promise<void> {
  const requests: string[] = [];
  let retainedResponse: Response | undefined;
  const fakeFetch: typeof fetch = async input => {
    const url = inputUrl(input);
    requests.push(url);
    if (url !== START_URL) {
      return new Response('Synthetic file');
    }

    const response = new Response(null, {
      status: 302,
      headers: { location: FINAL_URL },
    });
    retainedResponse = response.clone();
    return response;
  };

  const response = await fetchWithValidatedRedirects({
    url: START_URL,
    fetch: fakeFetch,
  });

  assert.ok(
    retainedResponse,
    'the fetch wrapper did not retain a response clone',
  );
  assert.deepEqual(requests, [START_URL, FINAL_URL]);
  assert.equal(await response.text(), 'Synthetic file');
}

async function nonRedirectWithRetainedClone(): Promise<void> {
  const requests: string[] = [];
  let retainedResponse: Response | undefined;
  const fakeFetch: typeof fetch = async input => {
    requests.push(inputUrl(input));
    const response = new Response('Synthetic file');
    retainedResponse = response.clone();
    return response;
  };

  const response = await fetchWithValidatedRedirects({
    url: START_URL,
    fetch: fakeFetch,
  });

  assert.ok(
    retainedResponse,
    'the fetch wrapper did not retain a response clone',
  );
  assert.deepEqual(requests, [START_URL]);
  assert.equal(await response.text(), 'Synthetic file');
  assert.equal(await retainedResponse.text(), 'Synthetic file');
}

async function main(): Promise<void> {
  for (const status of REDIRECT_STATUSES) {
    await redirectWithoutClone(status);
  }
  await redirectWithReadClone();
  await redirectWithCanceledClone();
  await bodylessRedirectWithRetainedClone();
  await nonRedirectWithRetainedClone();

  const stalledStatuses: number[] = [];
  for (const status of REDIRECT_STATUSES) {
    const observed = await retainedUnreadCloneScenario(status);
    if (
      observed.stateBeforeCleanup !== 'resolved' ||
      observed.requestsBeforeCleanup.join(',') !== `${START_URL},${FINAL_URL}`
    ) {
      stalledStatuses.push(status);
    }
  }

  assert.deepEqual(
    stalledStatuses,
    [],
    `ISSUE #21055 REPRODUCED: redirects stalled with retained unread clones for statuses ${stalledStatuses.join(', ')}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
