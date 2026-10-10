import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  useCompletion,
  useObject,
} from '../../../../packages/vue/dist/index.js';
import type { effectScope as effectScopeFunction } from '../../../../packages/vue/node_modules/vue/dist/vue.d.mts';
import { z } from 'zod/v4';

class ReproducedBugError extends Error {}

type EffectScopeFactory = typeof effectScopeFunction;

const { effectScope } = createRequire(import.meta.url)(
  '../../../../packages/vue/node_modules/vue',
) as { effectScope: EffectScopeFactory };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function main() {
  const objectResponse = deferred<Response>();
  const completionResponse = deferred<Response>();
  const objectFetchStarted = deferred<void>();
  const completionFetchStarted = deferred<void>();

  const scope = effectScope();
  const state = scope.run(() => {
    const object = useObject({
      api: '/object',
      schema: z.object({ ok: z.boolean() }),
      fetch: async () => {
        objectFetchStarted.resolve(undefined);
        return objectResponse.promise;
      },
    });
    const completion = useCompletion({
      api: '/completion',
      streamProtocol: 'text',
      fetch: async () => {
        completionFetchStarted.resolve(undefined);
        return completionResponse.promise;
      },
    });
    return { object, completion };
  });
  assert.ok(state, 'Vue effect scope did not return composable state');

  const objectRequest = state.object.submit('test');
  await objectFetchStarted.promise;
  const duringObjectRequest = {
    objectLoading: state.object.isLoading.value,
    completionLoading: state.completion.isLoading.value,
  };
  objectResponse.resolve(new Response('{"ok":true}'));
  await objectRequest;
  const afterObjectRequest = {
    objectLoading: state.object.isLoading.value,
    completionLoading: state.completion.isLoading.value,
  };

  const completionRequest = state.completion.complete('test');
  await completionFetchStarted.promise;
  const duringCompletionRequest = {
    objectLoading: state.object.isLoading.value,
    completionLoading: state.completion.isLoading.value,
  };
  completionResponse.resolve(new Response('done'));
  await completionRequest;
  const afterCompletionRequest = {
    objectLoading: state.object.isLoading.value,
    completionLoading: state.completion.isLoading.value,
  };

  scope.stop();

  assert.equal(
    duringObjectRequest.objectLoading,
    true,
    'useObject did not enter its own loading state',
  );
  assert.equal(
    duringCompletionRequest.completionLoading,
    true,
    'useCompletion did not enter its own loading state',
  );
  assert.deepEqual(afterObjectRequest, {
    objectLoading: false,
    completionLoading: false,
  });
  assert.deepEqual(afterCompletionRequest, {
    objectLoading: false,
    completionLoading: false,
  });

  const collisions = [];
  if (duringObjectRequest.completionLoading !== false) {
    collisions.push('useObject made the unused useCompletion report loading');
  }
  if (duringCompletionRequest.objectLoading !== false) {
    collisions.push('useCompletion made the unused useObject report loading');
  }

  if (collisions.length > 0) {
    console.error(
      'ISSUE_22574: unrelated Vue composables share loading state\n' +
        collisions.map(collision => `- ${collision}`).join('\n'),
    );
    throw new ReproducedBugError('default loading-state keys collided');
  }

  console.log('Issue #22574 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    process.exitCode = 1;
    return;
  }
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
