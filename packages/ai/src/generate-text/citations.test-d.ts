import type {
  LanguageModelV4Citation,
  LanguageModelV4Text,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import type { Citation, TextUIPart } from '../index';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import type { ContentPart } from './content-part';
import type { TextStreamTextEndPart } from './stream-text-result';

it('uses the same citation contract for providers, core, and UI', () => {
  expectTypeOf<Citation>().toEqualTypeOf<LanguageModelV4Citation>();
  expectTypeOf<LanguageModelV4Text['citations']>().toEqualTypeOf<
    Array<Citation> | undefined
  >();
  expectTypeOf<
    Extract<LanguageModelV4StreamPart, { type: 'text-end' }>['citations']
  >().toEqualTypeOf<Array<Citation> | undefined>();
  expectTypeOf<
    Extract<ContentPart<{}>, { type: 'text' }>['citations']
  >().toEqualTypeOf<Array<Citation> | undefined>();
  expectTypeOf<TextStreamTextEndPart['citations']>().toEqualTypeOf<
    Array<Citation> | undefined
  >();
  expectTypeOf<TextUIPart['citations']>().toEqualTypeOf<
    Array<Citation> | undefined
  >();
  expectTypeOf<
    Extract<UIMessageChunk, { type: 'text-end' }>['citations']
  >().toEqualTypeOf<Array<Citation> | undefined>();
});
