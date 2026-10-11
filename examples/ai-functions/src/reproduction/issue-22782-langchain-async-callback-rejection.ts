import { AIMessageChunk } from '@langchain/core/messages';
import { toUIMessageStream } from '@ai-sdk/langchain';
import type { UIMessageChunk } from 'ai';

type CallbackName = 'onToken' | 'onText';

interface ScenarioResult {
  callbackName: CallbackName;
  chunks: UIMessageChunk[];
  failure: Error;
  observedErrors: Error[];
  order: string[];
  unhandledRejections: unknown[];
}

const waitForImmediate = () =>
  new Promise<void>(resolve => setImmediate(resolve));

async function runScenario(
  callbackName: CallbackName,
  allUnhandledRejections: unknown[],
): Promise<ScenarioResult> {
  const failure = new Error(`synthetic ${callbackName} callback failure`);
  const observedErrors: Error[] = [];
  const order: string[] = [];
  const unhandledStartIndex = allUnhandledRejections.length;

  async function* source() {
    yield new AIMessageChunk('hello');
  }

  const rejectAfterDelay = async () => {
    order.push(`${callbackName}:start`);

    await new Promise<void>((_resolve, reject) => {
      setImmediate(() => {
        order.push(`${callbackName}:reject`);
        reject(failure);
      });
    });
  };

  const chunks: UIMessageChunk[] = [];
  for await (const chunk of toUIMessageStream(source(), {
    [callbackName]: rejectAfterDelay,
    onFinal: () => {
      order.push('onFinal');
    },
    onFinish: () => {
      order.push('onFinish');
    },
    onError: error => {
      observedErrors.push(error);
      order.push('onError');
    },
  })) {
    chunks.push(chunk);
  }

  // Give Node.js time to report a callback promise that the adapter ignored.
  await waitForImmediate();
  await waitForImmediate();

  return {
    callbackName,
    chunks,
    failure,
    observedErrors,
    order,
    unhandledRejections: allUnhandledRejections.slice(unhandledStartIndex),
  };
}

function isReportedFailure(result: ScenarioResult): boolean {
  return (
    result.unhandledRejections.includes(result.failure) &&
    result.observedErrors.length === 0 &&
    result.chunks.some(chunk => chunk.type === 'finish') &&
    !result.chunks.some(chunk => chunk.type === 'error')
  );
}

function isExpectedBehavior(result: ScenarioResult): boolean {
  return (
    result.unhandledRejections.length === 0 &&
    result.observedErrors.length === 1 &&
    result.observedErrors[0] === result.failure &&
    !result.chunks.some(chunk => chunk.type === 'finish') &&
    result.chunks.some(
      chunk =>
        chunk.type === 'error' && chunk.errorText === result.failure.message,
    ) &&
    result.order.join(',') ===
      `${result.callbackName}:start,${result.callbackName}:reject,onFinal,onError`
  );
}

async function main() {
  const allUnhandledRejections: unknown[] = [];
  const onUnhandledRejection = (error: unknown) => {
    allUnhandledRejections.push(error);
  };
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    const results = [
      await runScenario('onToken', allUnhandledRejections),
      await runScenario('onText', allUnhandledRejections),
    ];

    console.log(
      JSON.stringify(
        results.map(result => ({
          callbackName: result.callbackName,
          chunkTypes: result.chunks.map(chunk => chunk.type),
          onErrorCalls: result.observedErrors.length,
          order: result.order,
          unhandledRejections: result.unhandledRejections.map(error =>
            error instanceof Error ? error.message : String(error),
          ),
        })),
        null,
        2,
      ),
    );

    if (results.every(isExpectedBehavior)) {
      return;
    }

    if (results.every(isReportedFailure)) {
      throw new Error(
        'ISSUE_22782_REPRODUCED: rejected async onToken/onText callbacks were unhandled while streams finished without onError',
      );
    }

    throw new Error(
      'ISSUE_22782_UNEXPECTED_OUTCOME: callback rejection behavior differed from both the report and the expected fix',
    );
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
}

await main();
