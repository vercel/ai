import { createBlackForestLabs } from '@ai-sdk/black-forest-labs';
import { FireworksImageModel } from '@ai-sdk/fireworks';

const pollIntervalMillis = 10;
const pollTimeoutMillis = 25;
const pollRequestDurationMillis = 120;
const maximumExpectedDurationMillis = 250;

type PollBehavior = 'delayed' | 'hanging';
type Settlement = 'resolved' | 'rejected' | 'watchdog-expired';

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function abortError(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
  );
}

async function abortableDelay(
  durationMillis: number,
  signal?: AbortSignal | null,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }

    const timer = setTimeout(resolve, durationMillis);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError(signal));
      },
      { once: true },
    );
  });
}

function hangingResponse(signal?: AbortSignal | null): Promise<Response> {
  return new Promise<Response>((_, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }

    signal?.addEventListener('abort', () => reject(abortError(signal)), {
      once: true,
    });
  });
}

function createBlackForestLabsFetch(behavior: PollBehavior): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (url === 'https://bfl.example/v1/flux-pro-1.1') {
      return jsonResponse({
        id: 'bfl-request',
        polling_url: 'https://bfl.example/poll',
      });
    }

    if (url.startsWith('https://bfl.example/poll')) {
      if (behavior === 'hanging') {
        return hangingResponse(init?.signal);
      }

      await abortableDelay(pollRequestDurationMillis, init?.signal);
      return jsonResponse({ status: 'Pending' });
    }

    throw new Error(`Unexpected Black Forest Labs URL: ${url}`);
  };
}

function createFireworksFetch(behavior: PollBehavior): typeof fetch {
  const submitUrl =
    'https://fireworks.example/workflows/accounts/fireworks/models/flux-kontext-pro';
  const pollUrl = `${submitUrl}/get_result`;

  return async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (url === submitUrl) {
      return jsonResponse({ request_id: 'fireworks-request' });
    }

    if (url === pollUrl) {
      if (behavior === 'hanging') {
        return hangingResponse(init?.signal);
      }

      await abortableDelay(pollRequestDurationMillis, init?.signal);
      return jsonResponse({
        id: 'fireworks-request',
        status: 'Pending',
        result: null,
      });
    }

    throw new Error(`Unexpected Fireworks URL: ${url}`);
  };
}

function generateWithBlackForestLabs(behavior: PollBehavior): Promise<unknown> {
  const provider = createBlackForestLabs({
    apiKey: 'test-key',
    baseURL: 'https://bfl.example/v1',
    fetch: createBlackForestLabsFetch(behavior),
    pollIntervalMillis,
    pollTimeoutMillis,
  });

  return Promise.resolve(
    provider.image('flux-pro-1.1').doGenerate({
      prompt: 'test',
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: '1:1',
      seed: undefined,
      providerOptions: {},
    }),
  );
}

function generateWithFireworks(behavior: PollBehavior): Promise<unknown> {
  const model = new FireworksImageModel(
    'accounts/fireworks/models/flux-kontext-pro',
    {
      provider: 'fireworks.image',
      baseURL: 'https://fireworks.example',
      headers: () => ({ Authorization: 'Bearer test-key' }),
      fetch: createFireworksFetch(behavior),
      pollIntervalMillis,
      pollTimeoutMillis,
    },
  );

  return model.doGenerate({
    prompt: 'test',
    files: undefined,
    mask: undefined,
    n: 1,
    size: undefined,
    aspectRatio: '1:1',
    seed: undefined,
    providerOptions: {},
  });
}

async function observeSettlement(
  operation: Promise<unknown>,
  watchdogMillis: number,
): Promise<Settlement> {
  let timer: ReturnType<typeof setTimeout>;
  const watchdog = new Promise<Settlement>(resolve => {
    timer = setTimeout(() => resolve('watchdog-expired'), watchdogMillis);
  });
  const settlement = operation
    .then<Settlement>(() => 'resolved')
    .catch<Settlement>(() => 'rejected');

  try {
    return await Promise.race([settlement, watchdog]);
  } finally {
    clearTimeout(timer!);
  }
}

async function checkProvider(
  name: string,
  generate: (behavior: PollBehavior) => Promise<unknown>,
): Promise<string[]> {
  const failures: string[] = [];

  const start = performance.now();
  const delayedSettlement = await observeSettlement(generate('delayed'), 2_000);
  const elapsedMillis = performance.now() - start;

  console.log(
    `${name} delayed poll: settlement=${delayedSettlement}, elapsed=${Math.round(elapsedMillis)}ms`,
  );

  if (
    delayedSettlement !== 'rejected' ||
    elapsedMillis > maximumExpectedDurationMillis
  ) {
    failures.push(
      `${name} exceeded the ${pollTimeoutMillis}ms polling deadline when each poll request took ${pollRequestDurationMillis}ms`,
    );
  }

  const hangingSettlement = await observeSettlement(
    generate('hanging'),
    maximumExpectedDurationMillis,
  );

  console.log(`${name} hanging poll: settlement=${hangingSettlement}`);

  if (hangingSettlement !== 'rejected') {
    failures.push(
      `${name} did not time out while a polling request remained unresolved`,
    );
  }

  return failures;
}

async function main(): Promise<void> {
  const failures = [
    ...(await checkProvider('Black Forest Labs', generateWithBlackForestLabs)),
    ...(await checkProvider('Fireworks', generateWithFireworks)),
  ];

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_21000_REPRODUCED: pollTimeoutMillis did not enforce a wall-clock polling deadline\n${failures
        .map(failure => `- ${failure}`)
        .join('\n')}`,
    );
  }

  console.log('pollTimeoutMillis enforced the wall-clock deadline');
}

main();
