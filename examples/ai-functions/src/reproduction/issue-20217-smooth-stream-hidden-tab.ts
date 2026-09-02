import { smoothStream } from '../../../../packages/ai/src/generate-text/smooth-stream';
import type { TextStreamPart } from '../../../../packages/ai/src/generate-text/stream-text-result';
import type { ToolSet } from '../../../../packages/ai/src/generate-text/tool-set';

const FAILURE_SIGNAL =
  'ISSUE #20217 REPRODUCED: hidden smoothStream blocked terminal text-end and next step until visibility returned';

async function main() {
  let hidden = false;
  const pendingHiddenDelays: Array<() => void> = [];

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get hidden() {
        return hidden;
      },
    },
  });

  const throttledBrowserDelay = async (delayInMs: number | null) => {
    if (delayInMs == null || !hidden) {
      return;
    }

    await new Promise<void>(resolve => {
      pendingHiddenDelays.push(resolve);
    });
  };

  let sourceController:
    | ReadableStreamDefaultController<TextStreamPart<ToolSet>>
    | undefined;

  const source = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      sourceController = controller;
    },
  });

  const smoothed = source.pipeThrough(
    smoothStream({
      delayInMs: 10,
      _internal: { delay: throttledBrowserDelay },
    })({ tools: {} }),
  );

  let terminalEventReceived = false;
  let nextStepStarted = false;
  let resolveFirstDelta: (() => void) | undefined;
  const firstDeltaReceived = new Promise<void>(resolve => {
    resolveFirstDelta = resolve;
  });
  let resolveTerminal: (() => void) | undefined;
  const terminalReceived = new Promise<void>(resolve => {
    resolveTerminal = resolve;
  });

  const consumption = (async () => {
    const reader = smoothed.getReader();

    while (true) {
      const { done, value: part } = await reader.read();
      if (done) {
        break;
      }

      if (part.type === 'text-delta' && part.text === 'first ') {
        resolveFirstDelta?.();
      }

      if (part.type === 'text-end') {
        terminalEventReceived = true;
        nextStepStarted = true;
        resolveTerminal?.();
      }
    }
  })();

  if (sourceController == null) {
    throw new Error(
      'Reproduction setup failed to initialize the source stream',
    );
  }

  sourceController.enqueue({ type: 'text-start', id: 'text-1' });
  sourceController.enqueue({
    type: 'text-delta',
    id: 'text-1',
    text: 'first ',
  });
  await firstDeltaReceived;

  hidden = true;
  sourceController.enqueue({
    type: 'text-delta',
    id: 'text-1',
    text: 'second ',
  });
  sourceController.enqueue({ type: 'text-end', id: 'text-1' });
  sourceController.close();

  const progressedWhileHidden = await Promise.race([
    terminalReceived.then(() => true),
    new Promise<false>(resolve => setTimeout(() => resolve(false), 100)),
  ]);

  if (progressedWhileHidden) {
    await consumption;

    if (!terminalEventReceived || !nextStepStarted) {
      throw new Error(
        'Expected terminal text-end and the simulated next step after hidden-tab progress',
      );
    }

    console.log(
      'PASS: smoothStream completed and started the next step while the document was hidden',
    );
    return;
  }

  hidden = false;
  for (const resolve of pendingHiddenDelays.splice(0)) {
    resolve();
  }
  await consumption;

  if (!terminalEventReceived || !nextStepStarted) {
    throw new Error(
      'The stalled stream did not recover after document visibility returned',
    );
  }

  throw new Error(FAILURE_SIGNAL);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
