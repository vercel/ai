import type { LanguageModelV4 } from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import * as z3 from 'zod/v3';
import { streamUI } from './stream-ui';

declare const model: LanguageModelV4;

it('infers transformed Zod 3 tool inputs', () => {
  streamUI({
    model,
    prompt: 'Weather',
    tools: {
      weather: {
        inputSchema: z3.object({
          city: z3.string(),
          days: z3.string().transform(value => Number(value)),
        }),
        generate: ({ city, days }) => {
          expectTypeOf(city).toEqualTypeOf<string>();
          expectTypeOf(days).toEqualTypeOf<number>();
          return city;
        },
      },
    },
  });
});
