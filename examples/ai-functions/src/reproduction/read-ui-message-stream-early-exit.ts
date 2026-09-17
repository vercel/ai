import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';

const closedControllerMessage = 'Invalid state: Controller is already closed';

function createFiniteUIMessageStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of [
        { type: 'start', messageId: 'example-message' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello.' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish', finishReason: 'stop' },
      ] satisfies UIMessageChunk[]) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function containsText(message: UIMessage): boolean {
  return message.parts.some(
    part => part.type === 'text' && part.text.length > 0,
  );
}

async function waitForUnhandledRejection(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 25));
}

async function consumeFully(terminateOnError: boolean): Promise<void> {
  for await (const _message of readUIMessageStream({
    stream: createFiniteUIMessageStream(),
    terminateOnError,
  })) {
    // Consume every snapshot as a control.
  }
}

async function exitWithBreak(terminateOnError: boolean): Promise<void> {
  for await (const message of readUIMessageStream({
    stream: createFiniteUIMessageStream(),
    terminateOnError,
  })) {
    if (containsText(message)) {
      break;
    }
  }
}

async function exitWithReaderCancel(terminateOnError: boolean): Promise<void> {
  const reader = readUIMessageStream({
    stream: createFiniteUIMessageStream(),
    terminateOnError,
  }).getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || containsText(value)) {
        break;
      }
    }

    await reader.cancel();
  } finally {
    reader.releaseLock();
  }
}

async function main() {
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    for (const terminateOnError of [false, true]) {
      await consumeFully(terminateOnError);
      await waitForUnhandledRejection();

      if (unhandledRejections.length > 0) {
        throw new Error(
          'The full-consumption control unexpectedly emitted an unhandled rejection.',
          { cause: unhandledRejections[0] },
        );
      }
    }

    const scenarios = [
      {
        name: 'break with terminateOnError=false',
        run: () => exitWithBreak(false),
      },
      {
        name: 'reader.cancel() with terminateOnError=false',
        run: () => exitWithReaderCancel(false),
      },
      {
        name: 'break with terminateOnError=true',
        run: () => exitWithBreak(true),
      },
      {
        name: 'reader.cancel() with terminateOnError=true',
        run: () => exitWithReaderCancel(true),
      },
    ];
    const failures: string[] = [];

    for (const scenario of scenarios) {
      unhandledRejections.length = 0;
      await scenario.run();
      await waitForUnhandledRejection();

      const closedControllerRejection = unhandledRejections.find(
        reason =>
          reason instanceof TypeError &&
          reason.message === closedControllerMessage,
      );

      if (closedControllerRejection != null) {
        failures.push(scenario.name);
      } else if (unhandledRejections.length > 0) {
        throw new Error(
          `${scenario.name} emitted a different unhandled rejection.`,
          { cause: unhandledRejections[0] },
        );
      }
    }

    if (failures.length > 0) {
      console.error(`Affected scenarios: ${failures.join(', ')}`);
      throw new Error(
        'ISSUE #20991 REPRODUCED: early exit from readUIMessageStream caused an unhandled closed-controller rejection.',
      );
    }

    console.log(
      'PASS: early exit from readUIMessageStream emitted no unhandled rejections.',
    );
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
