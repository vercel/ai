import { createRequire } from 'node:module';
import { useCompletion } from '../../../../packages/vue/dist/index.js';

const require = createRequire(import.meta.url);
const { effectScope } =
  require('../../../../packages/vue/node_modules/vue') as {
    effectScope: () => {
      run: <T>(fn: () => T) => T | undefined;
      stop: () => void;
    };
  };

const initialCompletion = 'PREVIOUS';

async function flushUpdates() {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
}

function emptyTextResponse() {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    { status: 200 },
  );
}

async function main() {
  const failures: string[] = [];
  const scope = effectScope();

  const manuallyCleared = scope.run(() =>
    useCompletion({
      id: 'issue-19243-manual-clear',
      initialCompletion,
    }),
  )!;

  await flushUpdates();
  manuallyCleared.setCompletion('');
  await flushUpdates();

  if (manuallyCleared.completion.value !== '') {
    failures.push(
      `setCompletion('') kept ${JSON.stringify(manuallyCleared.completion.value)}`,
    );
  }

  let releaseResponse!: () => void;
  const responseGate = new Promise<void>(resolve => {
    releaseResponse = resolve;
  });
  const delayed = scope.run(() =>
    useCompletion({
      id: 'issue-19243-delayed-response',
      initialCompletion,
      streamProtocol: 'text',
      fetch: async () => {
        await responseGate;
        return emptyTextResponse();
      },
    }),
  )!;

  await flushUpdates();
  const delayedRequest = delayed.complete('hi');
  await flushUpdates();

  if (delayed.completion.value !== '') {
    failures.push(
      `request start kept ${JSON.stringify(delayed.completion.value)}`,
    );
  }

  releaseResponse();
  await delayedRequest;
  await flushUpdates();

  const emptyResult = scope.run(() =>
    useCompletion({
      id: 'issue-19243-empty-response',
      initialCompletion,
      streamProtocol: 'text',
      fetch: async () => emptyTextResponse(),
    }),
  )!;

  await flushUpdates();
  await emptyResult.complete('hi');
  await flushUpdates();

  if (emptyResult.completion.value !== '') {
    failures.push(
      `empty response kept ${JSON.stringify(emptyResult.completion.value)}`,
    );
  }

  if (failures.length > 0) {
    scope.stop();
    throw new Error(
      `Issue #19243 reproduced: Vue useCompletion cannot preserve an empty completion; ${failures.join(
        '; ',
      )}`,
    );
  }

  console.log(
    'Vue useCompletion preserved an empty completion after manual clearing, at request start, and after an empty response.',
  );
  scope.stop();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
