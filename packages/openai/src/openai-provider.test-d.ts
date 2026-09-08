import type { ImageModelV3 } from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { openai } from './index';

it('types GPT Image 2.5 models', () => {
  expectTypeOf(
    openai.image('gpt-image-2.5-flare'),
  ).toEqualTypeOf<ImageModelV3>();
  expectTypeOf(
    openai.image('gpt-image-2.5-flare-2026-09-08'),
  ).toEqualTypeOf<ImageModelV3>();
  expectTypeOf(
    openai.image('gpt-image-2.5-sunburst'),
  ).toEqualTypeOf<ImageModelV3>();
  expectTypeOf(
    openai.image('gpt-image-2.5-sunburst-2026-09-08'),
  ).toEqualTypeOf<ImageModelV3>();
});
