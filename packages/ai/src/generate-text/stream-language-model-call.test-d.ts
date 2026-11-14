import { describe, expectTypeOf, it } from 'vitest';
import type { ToolSet } from '@ai-sdk/provider-utils';
import type {
  Experimental_LanguageModelStreamPart,
  LanguageModelStreamPart,
} from './index';

describe('Experimental_LanguageModelStreamPart', () => {
  it('should remain compatible with LanguageModelStreamPart', () => {
    expectTypeOf<Experimental_LanguageModelStreamPart>().toEqualTypeOf<LanguageModelStreamPart>();
  });

  it('should keep the tool set parameter', () => {
    type Tools = { weather: ToolSet[string] };

    expectTypeOf<Experimental_LanguageModelStreamPart<Tools>>().toEqualTypeOf<
      LanguageModelStreamPart<Tools>
    >();
  });
});
