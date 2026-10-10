import { waitFor } from '@testing-library/vue';
import { effectScope } from 'vue';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { useCompletion } from './use-completion';
import { useObject } from './use-object';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useObject and useCompletion state isolation', () => {
  it('keeps loading state independent when ids are omitted', async () => {
    const objectResponse = deferred<Response>();
    const completionResponse = deferred<Response>();
    const objectFetchStarted = deferred<void>();
    const completionFetchStarted = deferred<void>();

    const scope = effectScope();
    const state = scope.run(() => ({
      object: useObject({
        api: '/object',
        schema: z.object({ ok: z.boolean() }),
        fetch: async () => {
          objectFetchStarted.resolve(undefined);
          return objectResponse.promise;
        },
      }),
      completion: useCompletion({
        api: '/completion',
        streamProtocol: 'text',
        fetch: async () => {
          completionFetchStarted.resolve(undefined);
          return completionResponse.promise;
        },
      }),
    }))!;

    state.object.submit('test');
    await objectFetchStarted.promise;
    const duringObjectRequest = {
      objectLoading: state.object.isLoading.value,
      completionLoading: state.completion.isLoading.value,
    };
    objectResponse.resolve(new Response('{"ok":true}'));
    await waitFor(() => {
      expect(state.object.isLoading.value).toBe(false);
    });

    const completionRequest = state.completion.complete('test');
    await completionFetchStarted.promise;
    const duringCompletionRequest = {
      objectLoading: state.object.isLoading.value,
      completionLoading: state.completion.isLoading.value,
    };
    completionResponse.resolve(new Response('done'));
    await completionRequest;

    expect(duringObjectRequest).toEqual({
      objectLoading: true,
      completionLoading: false,
    });
    expect(duringCompletionRequest).toEqual({
      objectLoading: false,
      completionLoading: true,
    });
    expect(state.object.isLoading.value).toBe(false);
    expect(state.completion.isLoading.value).toBe(false);

    scope.stop();
  });
});
