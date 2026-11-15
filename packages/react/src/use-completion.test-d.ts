import type { CompletionRequestOptions } from 'ai';
import { expectTypeOf } from 'vitest';
import { useCompletion } from './use-completion';

type TestBody = {
  model: 'fast' | 'smart';
};

function useTypedCompletion() {
  const { complete } = useCompletion<TestBody>({
    body: { model: 'fast' },
  });

  expectTypeOf(complete)
    .parameter(1)
    .toEqualTypeOf<CompletionRequestOptions<TestBody> | undefined>();

  complete('prompt', { body: { model: 'smart' } });
  complete('prompt', {
    body: {
      // @ts-expect-error - model must match TestBody
      model: 'slow',
    },
  });
}

function useUntypedCompletion() {
  const { complete } = useCompletion({
    body: { sessionId: 'session-id' },
  });

  complete('prompt', { body: { model: 'fast' } });
}

expectTypeOf(useTypedCompletion).returns.toBeVoid();
expectTypeOf(useUntypedCompletion).returns.toBeVoid();
