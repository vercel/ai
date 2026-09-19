import { createDownload, generateText, streamText, ToolLoopAgent } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';

type ApiName =
  | 'generateText'
  | 'streamText'
  | 'ToolLoopAgent.generate'
  | 'ToolLoopAgent.stream';
type DownloadPhase = 'headers' | 'body';
type CancellationKind = 'caller' | 'controlled-timeout-signal' | 'totalMs';

type CallCancellation = {
  abortSignal?: AbortSignal;
  timeout?: { totalMs: number };
};

type SyntheticDownload = {
  started: Promise<void>;
  getSignal: () => AbortSignal | null | undefined;
  release: () => void;
  restore: () => void;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const apis: ApiName[] = [
  'generateText',
  'streamText',
  'ToolLoopAgent.generate',
  'ToolLoopAgent.stream',
];
const phases: DownloadPhase[] = ['headers', 'body'];
const cancellationKinds: CancellationKind[] = [
  'caller',
  'controlled-timeout-signal',
  'totalMs',
];

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

const delay = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

function createModel(onModelCall: () => void) {
  return new MockLanguageModelV3({
    supportedUrls: {},
    doGenerate: async () => {
      onModelCall();
      return {
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      };
    },
    doStream: async () => {
      onModelCall();
      return {
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'ok' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      };
    },
  });
}

function createMessages() {
  return [
    {
      role: 'user' as const,
      content: [
        {
          type: 'file' as const,
          mediaType: 'text/plain',
          data: new URL('https://example.com/synthetic.txt'),
        },
      ],
    },
  ];
}

async function runApi(
  api: ApiName,
  model: MockLanguageModelV3,
  cancellation: CallCancellation,
): Promise<void> {
  const options = {
    model,
    maxRetries: 0,
    messages: createMessages(),
    ...cancellation,
  };

  switch (api) {
    case 'generateText':
      await generateText(options);
      return;
    case 'streamText':
      await streamText({ ...options, onError: () => {} }).text;
      return;
    case 'ToolLoopAgent.generate': {
      const agent = new ToolLoopAgent({ model, maxRetries: 0 });
      await agent.generate({
        messages: createMessages(),
        ...cancellation,
      });
      return;
    }
    case 'ToolLoopAgent.stream': {
      const agent = new ToolLoopAgent({ model, maxRetries: 0 });
      const result = await agent.stream({
        messages: createMessages(),
        ...cancellation,
      });
      await result.text;
    }
  }
}

function installSyntheticDownload(phase: DownloadPhase): SyntheticDownload {
  const originalFetch = globalThis.fetch;
  const started = deferred<void>();
  const pendingResponse = deferred<Response>();
  let signal: AbortSignal | null | undefined;
  let detach = () => {};
  let released = false;
  let bodyController:
    | ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>
    | undefined;
  const body =
    phase === 'body'
      ? new ReadableStream<Uint8Array<ArrayBuffer>>({
          start(controller) {
            bodyController = controller;
            controller.enqueue(new TextEncoder().encode('partial'));
          },
        })
      : undefined;

  globalThis.fetch = async (_url, init) => {
    signal = init?.signal;
    const abort = () => {
      if (phase === 'headers') {
        pendingResponse.reject(signal?.reason);
      } else if (!released) {
        released = true;
        bodyController?.error(signal?.reason);
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

    return new Response(body, {
      headers: { 'content-type': 'text/plain' },
    });
  };

  return {
    started: started.promise,
    getSignal: () => signal,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      if (phase === 'headers') {
        pendingResponse.resolve(
          new Response('synthetic file', {
            headers: { 'content-type': 'text/plain' },
          }),
        );
      } else {
        bodyController?.close();
      }
    },
    restore: () => {
      detach();
      globalThis.fetch = originalFetch;
    },
  };
}

async function waitForStart(download: SyntheticDownload, label: string) {
  await Promise.race([
    download.started,
    delay(1_000).then(() => {
      throw new Error(`Synthetic download did not start: ${label}`);
    }),
  ]);
}

async function observeSettlement(
  operation: Promise<void>,
  ms: number,
): Promise<boolean> {
  return await Promise.race([
    operation.then(() => true),
    delay(ms).then(() => false),
  ]);
}

async function runNormalControl(api: ApiName, phase: DownloadPhase) {
  const label = `${api}/${phase}/normal`;
  const download = installSyntheticDownload(phase);
  let modelReached = false;
  let settled = false;
  const operation = runApi(
    api,
    createModel(() => {
      modelReached = true;
    }),
    {},
  ).then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  try {
    await waitForStart(download, label);
    download.release();
    await Promise.race([
      operation,
      delay(1_000).then(() => {
        throw new Error(`Normal completion control stayed pending: ${label}`);
      }),
    ]);

    if (!settled || !modelReached) {
      throw new Error(`Normal completion control failed: ${label}`);
    }
  } finally {
    download.release();
    await operation;
    download.restore();
  }
}

async function runCreateDownloadControl(phase: DownloadPhase) {
  const label = `createDownload/${phase}/explicit-signal`;
  const download = installSyntheticDownload(phase);
  const controller = new AbortController();
  let settled = false;
  const operation = Promise.resolve(
    createDownload()({
      url: new URL('https://example.com/synthetic.txt'),
      abortSignal: controller.signal,
    }),
  ).then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  try {
    await waitForStart(download, label);
    controller.abort(new DOMException('controlled abort', 'AbortError'));
    const settledAfterAbort = await observeSettlement(operation, 250);
    if (
      !settledAfterAbort ||
      !settled ||
      download.getSignal() == null ||
      !download.getSignal()?.aborted
    ) {
      throw new Error(
        `Explicit createDownload signal control failed: ${label}`,
      );
    }
  } finally {
    download.release();
    await operation;
    download.restore();
  }
}

async function runCancellationCase(
  api: ApiName,
  phase: DownloadPhase,
  cancellationKind: CancellationKind,
) {
  const label = `${api}/${phase}/${cancellationKind}`;
  const download = installSyntheticDownload(phase);
  const controller =
    cancellationKind === 'totalMs' ? undefined : new AbortController();
  const cancellation: CallCancellation =
    cancellationKind === 'totalMs'
      ? { timeout: { totalMs: 25 } }
      : { abortSignal: controller?.signal };
  let modelReached = false;
  let settled = false;
  const operation = runApi(
    api,
    createModel(() => {
      modelReached = true;
    }),
    cancellation,
  ).then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  try {
    await waitForStart(download, label);

    if (cancellationKind === 'caller') {
      controller?.abort(new DOMException('caller cancelled', 'AbortError'));
    } else if (cancellationKind === 'controlled-timeout-signal') {
      controller?.abort(new DOMException('controlled timeout', 'TimeoutError'));
    }

    const settledAfterCancellation = await observeSettlement(operation, 250);
    const signal = download.getSignal();
    return {
      label,
      pending: !settledAfterCancellation,
      downloadReceivedSignal: signal != null,
      downloadAborted: signal?.aborted ?? false,
      modelReachedBeforeRelease: modelReached,
    };
  } finally {
    download.release();
    await operation;
    download.restore();
  }
}

async function main() {
  for (const api of apis) {
    for (const phase of phases) {
      await runNormalControl(api, phase);
    }
  }

  for (const phase of phases) {
    await runCreateDownloadControl(phase);
  }

  const results = [];
  for (const api of apis) {
    for (const phase of phases) {
      for (const cancellationKind of cancellationKinds) {
        results.push(await runCancellationCase(api, phase, cancellationKind));
      }
    }
  }

  const pending = results.filter(result => result.pending);
  const reachedModel = results.filter(
    result => result.modelReachedBeforeRelease,
  );
  const missingSignal = results.filter(
    result => !result.downloadReceivedSignal,
  );
  const downloadsNotAborted = results.filter(result => !result.downloadAborted);

  console.log(
    JSON.stringify(
      {
        cancellationCases: results.length,
        pendingAfterCancellation: pending.length,
        downloadsWithoutSignal: missingSignal.length,
        downloadsNotAborted: downloadsNotAborted.length,
        modelCallsBeforeRelease: reachedModel.length,
        normalCompletionControls: apis.length * phases.length,
        explicitSignalControls: phases.length,
      },
      null,
      2,
    ),
  );

  if (reachedModel.length > 0) {
    throw new Error(
      `Model was reached before cancellation completed: ${reachedModel
        .map(result => result.label)
        .join(', ')}`,
    );
  }

  if (pending.length > 0) {
    throw new Error(
      `Issue #20965 reproduced: ${pending.length}/${results.length} cancellation cases remained pending after caller cancellation or total timeout`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
