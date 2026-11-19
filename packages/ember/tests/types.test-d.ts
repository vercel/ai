import type { CompletionRequestOptions, UIMessage } from 'ai';
import { expectTypeOf } from 'vitest';
import { z } from 'zod/v4';
import { Chat, Completion, StructuredObject } from '../src/index';

type TestBody = {
  model: 'fast' | 'smart';
};

const parent = {};

const typedCompletion = new Completion<TestBody>(parent, {
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

expectTypeOf(new Chat().messages).toEqualTypeOf<UIMessage[]>();
expectTypeOf(new Chat(parent, {}).status).toEqualTypeOf<
  'submitted' | 'streaming' | 'ready' | 'error'
>();

class SomeComponent {
  isDestroying = false;
}

// @ts-expect-error - a component alone is not chat options
new Chat(new SomeComponent());

const recipe = new StructuredObject(parent, {
  api: '/api/recipe',
  schema: z.object({ name: z.string() }),
});

expectTypeOf(recipe.object).toEqualTypeOf<{ name?: string } | undefined>();
