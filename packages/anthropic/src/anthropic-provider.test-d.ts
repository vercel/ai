import type { Experimental_BatchLanguageModelV4 as BatchLanguageModelV4 } from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { anthropic } from './anthropic-provider';

it('types every Anthropic Messages model factory with its batch capability', () => {
  expectTypeOf(
    anthropic('claude-3-haiku-20240307'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    anthropic.languageModel('claude-3-haiku-20240307'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    anthropic.chat('claude-3-haiku-20240307'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    anthropic.messages('claude-3-haiku-20240307'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
});
