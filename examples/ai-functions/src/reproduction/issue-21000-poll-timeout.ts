import { createBlackForestLabs } from '@ai-sdk/black-forest-labs';
import { FireworksImageModel } from '@ai-sdk/fireworks';
import type { ImageModelV3 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { generateImage } from 'ai';

const pollIntervalMillis = 10;
const pollTimeoutMillis = 25;
const slowPollMillis = 120;
const maximumAcceptedElapsedMillis = 200;
const hangingPollWatchdogMillis = 250;

type ProviderName = 'Black Forest Labs' | 'Fireworks';
type PollBehavior = 'slow' | 'hanging';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function rejectWhenAborted(signal: AbortSignal | null | undefined) {
  return new Promise<never>((_, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    signal?.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    });
  });
}

function waitForPollResponse(
  behavior: PollBehavior,
  signal: AbortSignal | null | undefined,
) {
  if (behavior === 'hanging') {
    return rejectWhenAborted(signal);
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, slowPollMillis);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function createBlackForestLabsModel({
  behavior,
  onPoll,
}: {
  behavior: PollBehavior;
  onPoll: () => void;
}): ImageModelV3 {
  const fetch: FetchFunction = async (input, init) => {
    const url = input.toString();

    if (url === 'https://bfl.example/v1/flux-pro-1.1') {
      return jsonResponse({
        id: 'bfl-request',
        polling_url: 'https://bfl.example/poll',
      });
    }

    if (url.startsWith('https://bfl.example/poll')) {
      onPoll();
      await waitForPollResponse(behavior, init?.signal);
      return jsonResponse({ status: 'Pending' });
    }

    throw new Error(`Unexpected Black Forest Labs request: ${url}`);
  };

  return createBlackForestLabs({
    apiKey: 'test-key',
    baseURL: 'https://bfl.example/v1',
    fetch,
    pollIntervalMillis,
    pollTimeoutMillis,
  }).image('flux-pro-1.1');
}

function createFireworksModel({
  behavior,
  onPoll,
}: {
  behavior: PollBehavior;
  onPoll: () => void;
}): ImageModelV3 {
  const submitUrl =
    'https://fireworks.example/workflows/accounts/fireworks/models/flux-kontext-pro';
  const pollUrl = `${submitUrl}/get_result`;

  const fetch: FetchFunction = async (input, init) => {
    const url = input.toString();

    if (url === submitUrl) {
      return jsonResponse({ request_id: 'fireworks-request' });
    }

    if (url === pollUrl) {
      onPoll();
      await waitForPollResponse(behavior, init?.signal);
      return jsonResponse({
        id: 'fireworks-request',
        status: 'Pending',
        result: null,
      });
    }

    throw new Error(`Unexpected Fireworks request: ${url}`);
  };

  return new FireworksImageModel('accounts/fireworks/models/flux-kontext-pro', {
    provider: 'fireworks.image',
    baseURL: 'https://fireworks.example',
    headers: () => ({ Authorization: 'Bearer test-key' }),
    fetch,
    pollIntervalMillis,
    pollTimeoutMillis,
  });
}

function createModel(
  provider: ProviderName,
  behavior: PollBehavior,
  onPoll: () => void,
) {
  return provider === 'Black Forest Labs'
    ? createBlackForestLabsModel({ behavior, onPoll })
    : createFireworksModel({ behavior, onPoll });
}

async function generate(model: ImageModelV3) {
  await generateImage({
    model,
    prompt: 'A test image',
    maxRetries: 0,
  });
}

async function checkSlowPolling(provider: ProviderName) {
  let pollCount = 0;
  const model = createModel(provider, 'slow', () => {
    pollCount++;
  });
  const start = performance.now();
  const outcome = await generate(model).then(
    () => 'resolved' as const,
    () => 'rejected' as const,
  );
  const elapsedMillis = performance.now() - start;

  console.log(
    `${provider} slow polling: ${outcome} after ${Math.round(elapsedMillis)}ms with ${pollCount} poll request(s)`,
  );

  if (outcome !== 'rejected') {
    return `${provider} unexpectedly completed instead of timing out`;
  }

  if (elapsedMillis > maximumAcceptedElapsedMillis) {
    return `${provider} exceeded the ${pollTimeoutMillis}ms wall-clock timeout by taking ${Math.round(elapsedMillis)}ms`;
  }
}

async function checkHangingPolling(provider: ProviderName) {
  let pollCount = 0;
  const model = createModel(provider, 'hanging', () => {
    pollCount++;
  });
  const start = performance.now();
  const outcome = await Promise.race([
    generate(model).then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    new Promise<'watchdog'>(resolve =>
      setTimeout(() => resolve('watchdog'), hangingPollWatchdogMillis),
    ),
  ]);
  const elapsedMillis = performance.now() - start;

  console.log(
    `${provider} hanging polling: ${outcome} after ${Math.round(elapsedMillis)}ms with ${pollCount} poll request(s)`,
  );

  if (outcome === 'watchdog') {
    return `${provider} left an in-flight polling request pending beyond the ${hangingPollWatchdogMillis}ms watchdog`;
  }

  if (outcome !== 'rejected') {
    return `${provider} unexpectedly completed instead of timing out`;
  }
}

async function main() {
  const failures = (
    await Promise.all([
      checkSlowPolling('Black Forest Labs'),
      checkSlowPolling('Fireworks'),
      checkHangingPolling('Black Forest Labs'),
      checkHangingPolling('Fireworks'),
    ])
  ).filter((failure): failure is string => failure != null);

  if (failures.length > 0) {
    console.error(
      'ISSUE #21000 REPRODUCED: pollTimeoutMillis did not enforce a wall-clock deadline',
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
