import type {
  Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { xai } from './index';

it('types only xAI Responses models with their batch capability', () => {
  expectTypeOf(xai('grok-4.6')).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    xai.languageModel('grok-4.6'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(xai.responses('grok-4.6')).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(xai.chat('grok-4.6')).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(xai.chat('grok-4.6')).not.toMatchTypeOf<BatchLanguageModelV4>();
});
