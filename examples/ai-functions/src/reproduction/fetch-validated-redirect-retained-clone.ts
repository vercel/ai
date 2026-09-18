import { fetchWithValidatedRedirects } from '@ai-sdk/provider-utils';

const redirectStatuses = [301, 302, 303, 307, 308] as const;
const timeoutMs = 200;

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settleWithin<T>(
  promise: Promise<T>,
): Promise<{ settled: false } | { settled: true; value: T }> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ settled: false }), timeoutMs);

    promise
      .then(value => {
        clearTimeout(timer);
        resolve({ settled: true, value });
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function runRetainedCloneCase(status: number) {
  const requests: string[] = [];
  let savedResponse: Response | undefined;
  const entered = createDeferred<void>();

  const fakeFetch: typeof fetch = async input => {
    const url = String(input);
    requests.push(url);

    if (url.endsWith('/start')) {
      const response = new Response('Moved', {
        status,
        headers: { location: 'https://example.test/final' },
      });
      savedResponse = response.clone();
      entered.resolve(undefined);
      return response;
    }

    return new Response('Synthetic file');
  };

  const download = fetchWithValidatedRedirects({
    url: 'https://example.test/start',
    fetch: fakeFetch,
  });

  await entered.promise;
  const observed = await settleWithin(download);

  if (!observed.settled) {
    const requestsBeforeCleanup = [...requests];
    await savedResponse?.arrayBuffer();
    const response = await download;
    const cleanupBody = await response.text();

    return {
      stalled: true,
      requestsAtObservation: requestsBeforeCleanup,
      requestsAfterCleanup: requests,
      cleanupBody,
    };
  }

  const body = await observed.value.text();
  await savedResponse?.arrayBuffer();
  return { stalled: false, requestsAtObservation: requests, body };
}

async function runRedirectControl({
  status,
  cloneAction,
  redirectBody = 'Moved',
}: {
  status: number;
  cloneAction?: 'read' | 'cancel' | 'retain';
  redirectBody?: string | null;
}) {
  const requests: string[] = [];
  let savedResponse: Response | undefined;
  const entered = createDeferred<void>();

  const fakeFetch: typeof fetch = async input => {
    const url = String(input);
    requests.push(url);

    if (url.endsWith('/start')) {
      const response = new Response(redirectBody, {
        status,
        headers: { location: 'https://example.test/final' },
      });

      if (cloneAction != null) {
        savedResponse = response.clone();
      }

      entered.resolve(undefined);
      return response;
    }

    return new Response('Synthetic file');
  };

  const download = fetchWithValidatedRedirects({
    url: 'https://example.test/start',
    fetch: fakeFetch,
  });

  await entered.promise;

  const releaseClone =
    cloneAction === 'read'
      ? savedResponse?.arrayBuffer()
      : cloneAction === 'cancel'
        ? savedResponse?.body?.cancel()
        : undefined;

  const observed = await settleWithin(
    releaseClone == null
      ? download
      : Promise.all([releaseClone, download]).then(([, response]) => response),
  );

  if (!observed.settled) {
    await savedResponse?.arrayBuffer();
    await download;
    throw new Error(
      `Control unexpectedly stalled for status ${status} and clone action ${String(cloneAction)}`,
    );
  }

  const body = await observed.value.text();
  if (cloneAction === 'retain') {
    await savedResponse?.arrayBuffer();
  }

  if (
    requests.join(',') !==
      'https://example.test/start,https://example.test/final' ||
    body !== 'Synthetic file'
  ) {
    throw new Error(
      `Control did not follow status ${status}: ${JSON.stringify({ requests, body })}`,
    );
  }
}

async function runNonRedirectControl() {
  let savedResponse: Response | undefined;

  const response = await fetchWithValidatedRedirects({
    url: 'https://example.test/final',
    fetch: async () => {
      const result = new Response('Synthetic file');
      savedResponse = result.clone();
      return result;
    },
  });

  const body = await response.text();
  await savedResponse?.arrayBuffer();

  if (body !== 'Synthetic file') {
    throw new Error(`Non-redirect control returned ${JSON.stringify(body)}`);
  }
}

async function main() {
  const results = await Promise.all(
    redirectStatuses.map(status => runRetainedCloneCase(status)),
  );

  for (const status of redirectStatuses) {
    await runRedirectControl({ status });
  }
  await runRedirectControl({ status: 302, cloneAction: 'read' });
  await runRedirectControl({ status: 302, cloneAction: 'cancel' });
  await runRedirectControl({
    status: 302,
    cloneAction: 'retain',
    redirectBody: null,
  });
  await runNonRedirectControl();

  const stalledStatuses = redirectStatuses.filter(
    (_, index) => results[index].stalled,
  );

  if (stalledStatuses.length > 0) {
    const details = results.map((result, index) => ({
      status: redirectStatuses[index],
      ...result,
    }));
    console.error(
      `ISSUE #21055 REPRODUCED: fetchWithValidatedRedirects stalled before following redirect statuses ${stalledStatuses.join(', ')} while a fetch wrapper retained an unread response clone`,
    );
    console.error(JSON.stringify(details));
    process.exitCode = 1;
    return;
  }

  for (const [index, result] of results.entries()) {
    if (
      result.requestsAtObservation.join(',') !==
        'https://example.test/start,https://example.test/final' ||
      !('body' in result) ||
      result.body !== 'Synthetic file'
    ) {
      throw new Error(
        `Redirect ${redirectStatuses[index]} did not complete correctly: ${JSON.stringify(result)}`,
      );
    }
  }

  console.log(
    'PASS: retained response clones did not delay validated redirects.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
