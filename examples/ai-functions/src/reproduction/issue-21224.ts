import { callCompletionApi } from 'ai';

type StreamProtocol = 'text' | 'data';
type PreviousRequestOutcome = 'abort' | 'success' | 'error';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
};

type ScenarioResult = {
  protocol: StreamProtocol;
  previousOutcome: PreviousRequestOutcome;
  loadingAfterPreviousSettled: boolean;
  replacementControllerPreserved: boolean;
  completionAfterPreviousSettled: string;
  errorAfterPreviousSettled: string | undefined;
  replacementAbortedByStop: boolean;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

function successfulResponse(protocol: StreamProtocol) {
  return new Response(
    protocol === 'text'
      ? 'previous completion'
      : 'data: {"type":"text-delta","id":"0","delta":"previous completion"}\n\n',
  );
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${label}`)),
          2_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function runScenario({
  protocol,
  previousOutcome,
}: {
  protocol: StreamProtocol;
  previousOutcome: PreviousRequestOutcome;
}): Promise<ScenarioResult> {
  let activeController: AbortController | null = null;
  let loading = false;
  let completion = 'initial';
  let error: Error | undefined;
  const getActiveController = (): AbortController | null => activeController;

  const firstResponse = deferred<Response>();

  const sharedOptions = {
    api: '/api/completion',
    credentials: undefined,
    headers: undefined,
    body: {},
    streamProtocol: protocol,
    setCompletion: (value: string) => {
      completion = value;
    },
    setLoading: (value: boolean) => {
      loading = value;
    },
    setError: (value: Error | undefined) => {
      error = value;
    },
    setAbortController: (value: AbortController | null) => {
      activeController = value;
    },
    // This getter is ignored by the affected release. It makes the
    // reproduction compatible with the ownership-preserving fix.
    getAbortController: getActiveController,
    onFinish: undefined,
    onError: undefined,
  };

  const first = callCompletionApi({
    ...sharedOptions,
    prompt: 'first',
    fetch: () => firstResponse.promise,
  });
  const firstController = getActiveController();
  if (firstController == null) {
    throw new Error('The first completion did not install an abort controller');
  }

  if (previousOutcome === 'abort') {
    firstController.abort();
  }

  let replacementSignal: AbortSignal | undefined;
  const replacement = callCompletionApi({
    ...sharedOptions,
    prompt: 'replacement',
    fetch: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        replacementSignal = init?.signal ?? undefined;
        if (replacementSignal == null) {
          reject(new Error('The replacement request did not receive a signal'));
          return;
        }
        replacementSignal.addEventListener(
          'abort',
          () => reject(abortError()),
          { once: true },
        );
      }),
  });
  const replacementController = getActiveController();
  if (replacementController == null || replacementSignal == null) {
    throw new Error(
      'The replacement completion did not install an abort controller',
    );
  }

  if (previousOutcome === 'abort') {
    firstResponse.reject(abortError());
  } else if (previousOutcome === 'success') {
    firstResponse.resolve(successfulResponse(protocol));
  } else {
    firstResponse.reject(new Error('Previous request failed'));
  }

  await withTimeout(first, 'the previous request to settle');

  const result: ScenarioResult = {
    protocol,
    previousOutcome,
    loadingAfterPreviousSettled: loading,
    replacementControllerPreserved:
      getActiveController() === replacementController,
    completionAfterPreviousSettled: completion,
    errorAfterPreviousSettled: error?.message,
    replacementAbortedByStop: false,
  };

  // This is the user-visible second stop(). A correct implementation still
  // owns the replacement controller here and aborts the replacement request.
  getActiveController()?.abort();
  result.replacementAbortedByStop = replacementSignal.aborted;

  // Ensure the reproduction always terminates even when the second stop lost
  // the replacement controller.
  replacementController.abort();
  await withTimeout(replacement, 'the replacement request to settle');

  return result;
}

async function main() {
  const results: ScenarioResult[] = [];

  for (const protocol of ['text', 'data'] as const) {
    for (const previousOutcome of ['abort', 'success', 'error'] as const) {
      results.push(await runScenario({ protocol, previousOutcome }));
    }
  }

  console.log(JSON.stringify(results, null, 2));

  const failures = results.flatMap(result => {
    const prefix = `${result.protocol}/${result.previousOutcome}`;
    const scenarioFailures: string[] = [];

    if (!result.loadingAfterPreviousSettled) {
      scenarioFailures.push(`${prefix}: replacement was not loading`);
    }
    if (!result.replacementControllerPreserved) {
      scenarioFailures.push(`${prefix}: replacement controller was cleared`);
    }
    if (result.completionAfterPreviousSettled !== '') {
      scenarioFailures.push(
        `${prefix}: previous request overwrote completion with ${JSON.stringify(result.completionAfterPreviousSettled)}`,
      );
    }
    if (result.errorAfterPreviousSettled !== undefined) {
      scenarioFailures.push(
        `${prefix}: previous request overwrote error with ${JSON.stringify(result.errorAfterPreviousSettled)}`,
      );
    }
    if (!result.replacementAbortedByStop) {
      scenarioFailures.push(`${prefix}: stop did not abort replacement`);
    }

    return scenarioFailures;
  });

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    throw new Error(
      'ISSUE_21224_REPRODUCED: replacement request lost loading and cancellation ownership',
    );
  }
}

await main();
