import { createOpenAI } from '@ai-sdk/openai';
import { downloadBlob } from '@ai-sdk/provider-utils';
import { generateImage } from 'ai';

const downloadUrl = 'https://example.com/synthetic.png';
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';
const png = Uint8Array.from(atob(pngBase64), character =>
  character.charCodeAt(0),
);

type ApiPath = 'generateImage' | 'provider';
type DownloadTarget = 'image' | 'mask';
type StallPoint = 'headers' | 'body';

type Scenario = {
  apiPath: ApiPath;
  downloadTarget: DownloadTarget;
  stallPoint: StallPoint;
};

type DownloadStub = {
  started: Promise<void>;
  release: () => void;
  restore: () => void;
  getSignal: () => AbortSignal | null | undefined;
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const scenarios: Scenario[] = (['generateImage', 'provider'] as const).flatMap(
  apiPath =>
    (['image', 'mask'] as const).flatMap(downloadTarget =>
      (['headers', 'body'] as const).map(stallPoint => ({
        apiPath,
        downloadTarget,
        stallPoint,
      })),
    ),
);

function installDownloadStub(stallPoint: StallPoint): DownloadStub {
  const originalFetch = globalThis.fetch;
  const started = createDeferred<void>();
  let downloadSignal: AbortSignal | null | undefined;
  let release = () => {};
  let detach = () => {};

  globalThis.fetch = async (_input, init) => {
    downloadSignal = init?.signal;

    if (stallPoint === 'headers') {
      const pendingResponse = createDeferred<Response>();
      const abort = () =>
        pendingResponse.reject(
          downloadSignal?.reason ??
            new DOMException('The operation was aborted.', 'AbortError'),
        );

      if (downloadSignal?.aborted) {
        abort();
      } else if (downloadSignal != null) {
        downloadSignal.addEventListener('abort', abort, { once: true });
        detach = () => downloadSignal?.removeEventListener('abort', abort);
      }

      release = () => {
        pendingResponse.resolve(
          new Response(png, {
            headers: { 'content-type': 'image/png' },
          }),
        );
      };
      started.resolve();
      return pendingResponse.promise;
    }

    let bodyController: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
      pull() {
        started.resolve();
      },
    });
    const abort = () => {
      try {
        bodyController.error(
          downloadSignal?.reason ??
            new DOMException('The operation was aborted.', 'AbortError'),
        );
      } catch {
        // The stream was already released or aborted.
      }
    };

    if (downloadSignal?.aborted) {
      abort();
    } else if (downloadSignal != null) {
      downloadSignal.addEventListener('abort', abort, { once: true });
      detach = () => downloadSignal?.removeEventListener('abort', abort);
    }

    release = () => {
      try {
        bodyController.enqueue(png);
        bodyController.close();
      } catch {
        // The stream was already aborted.
      }
    };

    return new Response(body, {
      headers: { 'content-type': 'image/png' },
    });
  };

  return {
    started: started.promise,
    release: () => release(),
    restore: () => {
      detach();
      globalThis.fetch = originalFetch;
    },
    getSignal: () => downloadSignal,
  };
}

function createOperation({
  scenario,
  abortSignal,
  onPost,
}: {
  scenario: Scenario;
  abortSignal?: AbortSignal;
  onPost: () => void;
}): Promise<unknown> {
  const openai = createOpenAI({
    apiKey: 'synthetic-not-a-real-key',
    fetch: async (_url, init) => {
      onPost();
      init?.signal?.throwIfAborted();
      return Response.json({ data: [{ b64_json: pngBase64 }] });
    },
  });
  const model = openai.image('gpt-image-1');

  if (scenario.apiPath === 'generateImage') {
    return generateImage({
      model,
      prompt:
        scenario.downloadTarget === 'image'
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
    });
  }

  return Promise.resolve(
    model.doGenerate({
      prompt: 'Edit a synthetic square.',
      files:
        scenario.downloadTarget === 'image'
          ? [{ type: 'url', url: downloadUrl }]
          : [{ type: 'file', mediaType: 'image/png', data: png }],
      mask:
        scenario.downloadTarget === 'mask'
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
}

async function waitForAbortHandling(): Promise<void> {
  for (let index = 0; index < 10; index++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function runNormalCompletionControl(scenario: Scenario): Promise<void> {
  const download = installDownloadStub(scenario.stallPoint);
  let postCount = 0;
  let fulfilled = false;
  let rejected = false;
  const operation = createOperation({
    scenario,
    onPost: () => {
      postCount++;
    },
  }).then(
    () => {
      fulfilled = true;
    },
    () => {
      rejected = true;
    },
  );

  try {
    await download.started;
    download.release();
    await operation;
  } finally {
    download.release();
    await operation;
    download.restore();
  }

  if (!fulfilled || rejected || postCount !== 1) {
    throw new Error(
      `HARNESS_CONTROL_FAILED: normal completion failed for ${JSON.stringify(
        scenario,
      )}`,
    );
  }
}

async function runDownloadBlobCancellationControl(
  stallPoint: StallPoint,
): Promise<void> {
  const download = installDownloadStub(stallPoint);
  const controller = new AbortController();
  let settled = false;
  let rejected = false;
  const operation = downloadBlob(downloadUrl, {
    abortSignal: controller.signal,
  }).then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
      rejected = true;
    },
  );

  try {
    await download.started;
    controller.abort(
      new DOMException('Synthetic cancellation control.', 'AbortError'),
    );
    await waitForAbortHandling();
  } finally {
    download.release();
    await operation;
    download.restore();
  }

  if (
    !settled ||
    !rejected ||
    download.getSignal() == null ||
    !download.getSignal()?.aborted
  ) {
    throw new Error(
      `HARNESS_CONTROL_FAILED: downloadBlob did not cancel at ${stallPoint}`,
    );
  }
}

async function runCancellationScenario(scenario: Scenario) {
  const download = installDownloadStub(scenario.stallPoint);
  const controller = new AbortController();
  let postCount = 0;
  let settled = false;
  const operation = createOperation({
    scenario,
    abortSignal: controller.signal,
    onPost: () => {
      postCount++;
    },
  }).then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  let outcome: {
    scenario: Scenario;
    callerAborted: boolean;
    downloadReceivedSignal: boolean;
    downloadAborted: boolean;
    generationSettled: boolean;
    editPostCount: number;
  };

  try {
    await download.started;
    controller.abort(new DOMException('Synthetic cancellation.', 'AbortError'));
    await waitForAbortHandling();

    const downloadSignal = download.getSignal();
    outcome = {
      scenario,
      callerAborted: controller.signal.aborted,
      downloadReceivedSignal: downloadSignal != null,
      downloadAborted: downloadSignal?.aborted ?? false,
      generationSettled: settled,
      editPostCount: postCount,
    };
  } finally {
    download.release();
    await operation;
    download.restore();
  }

  return outcome;
}

async function main(): Promise<void> {
  const runtimeGlobal = globalThis as typeof globalThis & {
    EdgeRuntime?: unknown;
  };
  const hadEdgeRuntime = Object.hasOwn(runtimeGlobal, 'EdgeRuntime');
  const originalEdgeRuntime = runtimeGlobal.EdgeRuntime;

  // Force provider-utils to use the injected fetch so the reproduction is
  // deterministic and makes no network request while still executing in Node.
  runtimeGlobal.EdgeRuntime = 'issue-21080-reproduction';

  try {
    for (const scenario of scenarios) {
      await runNormalCompletionControl(scenario);
    }
    await runDownloadBlobCancellationControl('headers');
    await runDownloadBlobCancellationControl('body');

    const outcomes = [];
    for (const scenario of scenarios) {
      outcomes.push(await runCancellationScenario(scenario));
    }

    const invalidOutcomes = outcomes.filter(
      outcome =>
        !outcome.callerAborted ||
        outcome.editPostCount !== 0 ||
        (outcome.downloadReceivedSignal && !outcome.downloadAborted),
    );
    if (invalidOutcomes.length > 0) {
      throw new Error(
        `HARNESS_UNEXPECTED_OUTCOME: ${JSON.stringify(invalidOutcomes)}`,
      );
    }

    const pendingOutcomes = outcomes.filter(
      outcome => !outcome.generationSettled,
    );

    if (pendingOutcomes.length > 0) {
      console.error(
        'ISSUE_21080_REPRODUCED: OpenAI image-edit download cancellation did not settle all 8 cases',
      );
      console.error(JSON.stringify(pendingOutcomes, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(
      'ISSUE_21080_FIXED: all OpenAI image-edit downloads received cancellation and settled',
    );
  } finally {
    if (hadEdgeRuntime) {
      runtimeGlobal.EdgeRuntime = originalEdgeRuntime;
    } else {
      delete runtimeGlobal.EdgeRuntime;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
