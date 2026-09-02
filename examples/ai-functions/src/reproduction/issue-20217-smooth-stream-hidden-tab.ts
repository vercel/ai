import { smoothStream, type TextStreamPart } from 'ai';
import type { ToolSet } from '@ai-sdk/provider-utils';

const FAILURE_SIGNAL =
  'ISSUE_20217_REPRODUCED: smoothStream blocked terminal stream completion while the document was hidden';

async function main() {
  const fakeDocument = {
    visibilityState: 'visible' as DocumentVisibilityState,
  };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: fakeDocument,
  });

  let releaseHiddenDelay: (() => void) | undefined;
  let reportHiddenDelay: (() => void) | undefined;
  const hiddenDelayStarted = new Promise<void>(resolve => {
    reportHiddenDelay = resolve;
  });
  const delayCalls: Array<{
    delayInMs: number | null;
    visibilityState: DocumentVisibilityState;
  }> = [];
  let firstVisibleDelay = true;

  const delay = async (delayInMs: number | null) => {
    delayCalls.push({
      delayInMs,
      visibilityState: fakeDocument.visibilityState,
    });

    // Simulate switching tabs after the first visible word was smoothed.
    if (
      firstVisibleDelay &&
      fakeDocument.visibilityState === 'visible' &&
      delayInMs != null
    ) {
      firstVisibleDelay = false;
      fakeDocument.visibilityState = 'hidden';
      return;
    }

    // Model a browser-throttled chained timer that cannot make progress while
    // the document remains hidden.
    if (fakeDocument.visibilityState === 'hidden' && delayInMs != null) {
      reportHiddenDelay?.();
      await new Promise<void>(resolve => {
        releaseHiddenDelay = resolve;
      });
    }
  };

  const parts: TextStreamPart<ToolSet>[] = [
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', text: 'one two three ' },
    { type: 'text-end', id: 'text-1' },
  ];

  const source = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });

  let terminalPartReceived = false;
  let nextStepStarted = false;
  const receivedParts: TextStreamPart<ToolSet>[] = [];

  const completion = (async () => {
    const reader = source
      .pipeThrough(
        smoothStream({
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      )
      .getReader();

    while (true) {
      const { done, value: part } = await reader.read();
      if (done) {
        break;
      }

      receivedParts.push(part);
      if (part.type === 'text-end') {
        terminalPartReceived = true;
      }
    }

    nextStepStarted = true;
  })();

  const outcome = await Promise.race([
    completion.then(() => 'completed' as const),
    hiddenDelayStarted.then(() => 'blocked' as const),
  ]);

  if (outcome === 'blocked') {
    const blockedState = {
      delayCalls,
      nextStepStarted,
      receivedTypes: receivedParts.map(part => part.type),
      terminalPartReceived,
    };

    fakeDocument.visibilityState = 'visible';
    releaseHiddenDelay?.();
    await completion;

    console.error('Blocked while hidden:', blockedState);
    console.error('Recovered after focus:', {
      nextStepStarted,
      terminalPartReceived,
    });
    throw new Error(FAILURE_SIGNAL);
  }

  console.log('Stream completed while hidden:', {
    delayCalls,
    nextStepStarted,
    terminalPartReceived,
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
