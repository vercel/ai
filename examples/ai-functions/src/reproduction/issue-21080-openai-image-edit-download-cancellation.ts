import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createOpenAI } from '@ai-sdk/openai';
import { downloadBlob } from '@ai-sdk/provider-utils';
import { generateImage } from 'ai';

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';
const png = Uint8Array.from(Buffer.from(pngBase64, 'base64'));
const downloadUrl = 'https://example.com/issue-21080.png';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type Phase = 'headers' | 'body';
type EntryPoint = 'core' | 'provider';
type InputKind = 'image' | 'mask';

type DownloadHarness = {
  fetch: typeof globalThis.fetch;
  started: Promise<void>;
  bodyReadStarted: Promise<void>;
  release: () => void;
  detach: () => void;
  receivedSignal: () => AbortSignal | null | undefined;
};

function createStalledDownload(phase: Phase): DownloadHarness {
  const started = deferred<void>();
  const bodyReadStarted = deferred<void>();
  const pendingResponse = deferred<Response>();
  const pendingPull = deferred<void>();
  let signal: AbortSignal | null | undefined;
  let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let bodyFinished = false;
  let detach = () => {};

  const fetch: typeof globalThis.fetch = async (_input, init) => {
    signal = init?.signal;

    const abort = () => {
      if (phase === 'headers') {
        pendingResponse.reject(signal?.reason);
      } else if (!bodyFinished) {
        bodyFinished = true;
        bodyController?.error(signal?.reason);
        pendingPull.resolve();
      }
    };

    if (signal?.aborted) {
      abort();
    } else if (signal != null) {
      signal.addEventListener('abort', abort, { once: true });
      detach = () => signal?.removeEventListener('abort', abort);
    }

    started.resolve();

    if (phase === 'headers') {
      return pendingResponse.promise;
    }

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
        controller.enqueue(png.subarray(0, 8));
      },
      pull() {
        bodyReadStarted.resolve();
        return pendingPull.promise;
      },
    });

    return new Response(body, {
      headers: { 'content-type': 'image/png' },
    });
  };

  return {
    fetch,
    started: started.promise,
    bodyReadStarted: bodyReadStarted.promise,
    release() {
      if (phase === 'headers') {
        pendingResponse.resolve(
          new Response(png, {
            headers: { 'content-type': 'image/png' },
          }),
        );
      } else if (!bodyFinished) {
        bodyFinished = true;
        bodyController?.enqueue(png.subarray(8));
        bodyController?.close();
        pendingPull.resolve();
      }
    },
    detach() {
      detach();
    },
    receivedSignal() {
      return signal;
    },
  };
}

function createCompletedDownload(): typeof globalThis.fetch {
  return async () =>
    new Response(png, {
      headers: { 'content-type': 'image/png' },
    });
}

let activeDownloadFetch: typeof globalThis.fetch = createCompletedDownload();

function installSyntheticNodeDownloadFetch() {
  const require = createRequire(import.meta.url);
  const providerUtilsPackageJson =
    require.resolve('@ai-sdk/provider-utils/package.json');
  const providerUtilsRequire = createRequire(providerUtilsPackageJson);
  const undici = providerUtilsRequire('undici') as {
    fetch: typeof globalThis.fetch;
  };

  undici.fetch = (input, init) => activeDownloadFetch(input, init);
}

function createModel() {
  let postCount = 0;
  const openai = createOpenAI({
    apiKey: 'synthetic-not-a-real-key',
    fetch: async (_url, init) => {
      init?.signal?.throwIfAborted();
      postCount++;
      return Response.json({ data: [{ b64_json: pngBase64 }] });
    },
  });

  return {
    model: openai.image('gpt-image-1'),
    postCount: () => postCount,
  };
}

function invokeImageEdit({
  entryPoint,
  inputKind,
  abortSignal,
}: {
  entryPoint: EntryPoint;
  inputKind: InputKind;
  abortSignal?: AbortSignal;
}) {
  const { model, postCount } = createModel();

  const run = Promise.resolve(
    entryPoint === 'core'
      ? generateImage({
          model,
          prompt:
            inputKind === 'image'
              ? {
                  text: 'Edit a synthetic square.',
                  images: [downloadUrl],
                }
              : {
                  text: 'Edit a synthetic square.',
                  images: [png],
                  mask: downloadUrl,
                },
          abortSignal,
          maxRetries: 0,
        })
      : model.doGenerate({
          prompt: 'Edit a synthetic square.',
          files:
            inputKind === 'image'
              ? [{ type: 'url', url: downloadUrl }]
              : [{ type: 'file', data: png, mediaType: 'image/png' }],
          mask:
            inputKind === 'mask'
              ? { type: 'url', url: downloadUrl }
              : undefined,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
          abortSignal,
        }),
  );

  return { run, postCount };
}

async function waitForSettlement(
  promise: Promise<unknown>,
  timeoutMs: number,
): Promise<'fulfilled' | 'rejected' | 'pending'> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise.then(
        () => 'fulfilled' as const,
        () => 'rejected' as const,
      ),
      new Promise<'pending'>(resolve => {
        timer = setTimeout(() => resolve('pending'), timeoutMs);
      }),
    ]);
  } finally {
    if (timer != null) {
      clearTimeout(timer);
    }
  }
}

async function runCancellationCase({
  entryPoint,
  inputKind,
  phase,
}: {
  entryPoint: EntryPoint;
  inputKind: InputKind;
  phase: Phase;
}) {
  const harness = createStalledDownload(phase);
  activeDownloadFetch = harness.fetch;
  const caller = new AbortController();
  const { run, postCount } = invokeImageEdit({
    entryPoint,
    inputKind,
    abortSignal: caller.signal,
  });

  try {
    await harness.started;
    if (phase === 'body') {
      await harness.bodyReadStarted;
    }

    caller.abort(new Error('issue-21080 synthetic cancellation'));
    const settlement = await waitForSettlement(run, 100);
    const downloadSignal = harness.receivedSignal();

    return {
      name: `${entryPoint}/${inputKind}/${phase}`,
      receivedCallerSignal: downloadSignal === caller.signal,
      downloadAborted: downloadSignal?.aborted === true,
      settlement,
      postCount: postCount(),
    };
  } finally {
    harness.release();
    await run.catch(() => undefined);
    harness.detach();
  }
}

async function runNormalCompletionControls() {
  const controls: string[] = [];

  for (const entryPoint of ['core', 'provider'] as const) {
    for (const inputKind of ['image', 'mask'] as const) {
      for (const phase of ['headers', 'body'] as const) {
        activeDownloadFetch = createCompletedDownload();
        const { run, postCount } = invokeImageEdit({ entryPoint, inputKind });
        const result = await run;

        assert.equal(result.images.length, 1);
        assert.equal(postCount(), 1);
        controls.push(`${entryPoint}/${inputKind}/${phase}`);
      }
    }
  }

  return controls;
}

async function runDownloadBlobCancellationControl(phase: Phase) {
  const harness = createStalledDownload(phase);
  activeDownloadFetch = harness.fetch;
  const caller = new AbortController();
  const run = downloadBlob(downloadUrl, { abortSignal: caller.signal });

  try {
    await harness.started;
    if (phase === 'body') {
      await harness.bodyReadStarted;
    }

    caller.abort(new Error('downloadBlob control cancellation'));
    const settlement = await waitForSettlement(run, 100);

    assert.equal(harness.receivedSignal(), caller.signal);
    assert.equal(caller.signal.aborted, true);
    assert.equal(settlement, 'rejected');
  } finally {
    harness.release();
    await run.catch(() => undefined);
    harness.detach();
  }
}

async function main() {
  installSyntheticNodeDownloadFetch();

  const cancellationResults = [];
  for (const entryPoint of ['core', 'provider'] as const) {
    for (const inputKind of ['image', 'mask'] as const) {
      for (const phase of ['headers', 'body'] as const) {
        cancellationResults.push(
          await runCancellationCase({ entryPoint, inputKind, phase }),
        );
      }
    }
  }

  const normalControls = await runNormalCompletionControls();
  await runDownloadBlobCancellationControl('headers');
  await runDownloadBlobCancellationControl('body');

  const failures = cancellationResults.filter(
    result =>
      !result.receivedCallerSignal ||
      !result.downloadAborted ||
      result.settlement === 'pending' ||
      result.postCount !== 0,
  );

  console.log(
    JSON.stringify(
      {
        cancellationResults,
        normalCompletionControls: normalControls.length,
        downloadBlobCancellationControls: 2,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_21080_REPRODUCED: aborting OpenAI image edits did not cancel ${failures.length}/8 pending URL downloads`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
