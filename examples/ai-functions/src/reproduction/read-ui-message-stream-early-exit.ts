import assert from 'node:assert/strict';
import {
  readUIMessageStream,
  type UIMessageChunk,
} from '../../../../packages/ai/src';

type EarlyExitMode = 'break' | 'reader.cancel()';

const unhandledRejections: unknown[] = [];

process.on('unhandledRejection', reason => {
  unhandledRejections.push(reason);
});

function createFiniteMessageStream() {
  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'example-message' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'Hello.' },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish' },
  ];

  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function waitForUnhandledRejections() {
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
}

async function runEarlyExitCase({
  mode,
  terminateOnError,
}: {
  mode: EarlyExitMode;
  terminateOnError: boolean;
}) {
  const startIndex = unhandledRejections.length;
  const output = readUIMessageStream({
    stream: createFiniteMessageStream(),
    terminateOnError,
  });
  let receivedText = false;

  if (mode === 'break') {
    for await (const message of output) {
      receivedText ||= message.parts.some(
        part => part.type === 'text' && part.text.length > 0,
      );
      if (receivedText) {
        break;
      }
    }
  } else {
    const reader = output.getReader();
    try {
      while (true) {
        const { done, value: message } = await reader.read();
        assert.equal(done, false, 'stream ended before emitting text');
        receivedText ||= message.parts.some(
          part => part.type === 'text' && part.text.length > 0,
        );
        if (receivedText) {
          await reader.cancel();
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  assert.equal(receivedText, true, `${mode} case did not receive text`);
  await waitForUnhandledRejections();

  return unhandledRejections.slice(startIndex);
}

async function runFullConsumptionControl() {
  const startIndex = unhandledRejections.length;
  let finalText: string | undefined;

  for await (const message of readUIMessageStream({
    stream: createFiniteMessageStream(),
  })) {
    const textPart = message.parts.find(part => part.type === 'text');
    finalText = textPart?.text;
  }

  assert.equal(finalText, 'Hello.');
  await waitForUnhandledRejections();
  return unhandledRejections.slice(startIndex);
}

function isClosedControllerRejection(reason: unknown) {
  return (
    reason instanceof TypeError &&
    'code' in reason &&
    reason.code === 'ERR_INVALID_STATE' &&
    reason.message.includes('Controller is already closed')
  );
}

async function main() {
  const cases = [
    { mode: 'break' as const, terminateOnError: false },
    { mode: 'reader.cancel()' as const, terminateOnError: false },
    { mode: 'break' as const, terminateOnError: true },
    { mode: 'reader.cancel()' as const, terminateOnError: true },
  ];
  const failedCases: string[] = [];
  const unexpectedRejections: unknown[] = [];

  for (const testCase of cases) {
    const rejections = await runEarlyExitCase(testCase);
    const caseName = `${testCase.mode}, terminateOnError=${testCase.terminateOnError}`;

    if (rejections.some(isClosedControllerRejection)) {
      failedCases.push(caseName);
    }
    unexpectedRejections.push(
      ...rejections.filter(reason => !isClosedControllerRejection(reason)),
    );
  }

  const controlRejections = await runFullConsumptionControl();
  assert.deepEqual(
    controlRejections,
    [],
    'full-consumption control emitted an unhandled rejection',
  );
  assert.deepEqual(
    unexpectedRejections,
    [],
    'early-exit cases emitted an unexpected unhandled rejection',
  );

  if (failedCases.length > 0) {
    console.error(
      `REPRODUCTION FAILURE: readUIMessageStream early exit caused an unhandled closed-controller rejection in: ${failedCases.join('; ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Early exit and reader cancellation completed without unhandled rejections.',
  );
}

main().catch(error => {
  console.error('REPRODUCTION HARNESS FAILURE', error);
  process.exitCode = 2;
});
