import { smoothStream, type TextStreamPart, type ToolSet } from 'ai';

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

async function main() {
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  const simulatedDocument = {
    hidden: false,
    visibilityState: 'visible',
  };
  const blockedTimers: Array<() => void> = [];
  let notifyFirstDelay: (() => void) | undefined;
  const firstDelay = new Promise<void>(resolve => {
    notifyFirstDelay = resolve;
  });

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: simulatedDocument,
  });

  try {
    const transform = smoothStream<ToolSet>({
      delayInMs: 10,
      _internal: {
        delay: delayInMs => {
          notifyFirstDelay?.();
          notifyFirstDelay = undefined;

          if (
            delayInMs == null ||
            simulatedDocument.visibilityState !== 'hidden'
          ) {
            return Promise.resolve();
          }

          return new Promise<void>(resolve => {
            blockedTimers.push(resolve);
          });
        },
      },
    })({ tools: {} });

    const writer = transform.writable.getWriter();
    let textEnded = false;
    let nextStepStarted = false;

    const consume = (async () => {
      const reader = transform.readable.getReader();

      while (true) {
        const { done, value: part } = await reader.read();
        if (done) {
          break;
        }

        if (part.type === 'text-end') {
          textEnded = true;
          nextStepStarted = true;
        }
      }
    })();

    await writer.write({
      type: 'text-start',
      id: 'text-1',
    } satisfies TextStreamPart<ToolSet>);

    simulatedDocument.hidden = true;
    simulatedDocument.visibilityState = 'hidden';

    let textDeltaAccepted = false;
    const finishInput = writer
      .write({
        type: 'text-delta',
        id: 'text-1',
        text: 'first second ',
      } satisfies TextStreamPart<ToolSet>)
      .then(() => {
        textDeltaAccepted = true;
      })
      .then(() =>
        writer.write({
          type: 'text-end',
          id: 'text-1',
        } satisfies TextStreamPart<ToolSet>),
      )
      .then(() => writer.close());

    await firstDelay;

    const completedWhileHidden =
      (await Promise.race([
        consume.then(() => true),
        sleep(50).then(() => false),
      ])) === true;

    const stalledWhileHidden =
      !completedWhileHidden &&
      !textDeltaAccepted &&
      !textEnded &&
      !nextStepStarted;

    simulatedDocument.hidden = false;
    simulatedDocument.visibilityState = 'visible';
    for (const resolve of blockedTimers.splice(0)) {
      resolve();
    }

    await finishInput;
    await consume;

    if (!textEnded || !nextStepStarted) {
      throw new Error(
        'The stream did not recover after document visibility was restored.',
      );
    }

    if (stalledWhileHidden) {
      console.error(
        'ISSUE_20217_REPRODUCED: smoothStream blocked text-end and next step while document was hidden',
      );
      process.exitCode = 1;
      return;
    }

    if (!completedWhileHidden) {
      throw new Error(
        'The stream did not complete while hidden, but the reported stall invariants were not all observed.',
      );
    }

    console.log(
      'smoothStream completed and allowed the next step to start while the document was hidden.',
    );
  } finally {
    if (originalDocument == null) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      Object.defineProperty(globalThis, 'document', originalDocument);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
