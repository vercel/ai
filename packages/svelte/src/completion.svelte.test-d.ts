import type { CompletionRequestOptions } from 'ai';
import { expectTypeOf } from 'vitest';
import { Completion } from './completion.svelte.js';

type TestBody = {
  model: 'fast' | 'smart';
};

const typedCompletion = new Completion<TestBody>({
  body: { model: 'fast' },
});

expectTypeOf(typedCompletion.complete)
  .parameter(1)
  .toEqualTypeOf<CompletionRequestOptions<TestBody> | undefined>();

typedCompletion.complete('prompt', { body: { model: 'smart' } });
typedCompletion.complete('prompt', {
  body: {
    // @ts-expect-error - model must match TestBody
    model: 'slow',
  },
});

const untypedCompletion = new Completion({
  body: { sessionId: 'session-id' },
});

untypedCompletion.complete('prompt', { body: { model: 'fast' } });
