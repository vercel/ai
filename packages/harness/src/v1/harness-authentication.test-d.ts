import { expectTypeOf, test } from 'vitest';
import type {
  HarnessV1Authentication,
  HarnessV1AuthenticationEnvironment,
} from './harness-authentication';

test('defaults adapter authentication to direct', () => {
  expectTypeOf<HarnessV1Authentication>().toEqualTypeOf<
    'auto' | 'direct' | 'ai-gateway' | HarnessV1AuthenticationEnvironment
  >();
});

test('supports a non-empty union of adapter authentication choices', () => {
  expectTypeOf<HarnessV1Authentication<'anthropic' | 'openai'>>().toEqualTypeOf<
    | 'auto'
    | 'ai-gateway'
    | 'anthropic'
    | 'openai'
    | HarnessV1AuthenticationEnvironment
  >();
});

test('rejects empty and non-concrete adapter authentication choices', () => {
  expectTypeOf<HarnessV1Authentication<never>>().toEqualTypeOf<never>();
  expectTypeOf<HarnessV1Authentication<string>>().toEqualTypeOf<never>();
});
