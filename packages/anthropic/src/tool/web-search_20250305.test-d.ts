/**
 * Type tests for the webSearch_20250305 tool.
 * Ensures the tool can be used correctly with generateText and streamText.
 */
import { Tool, InferSchema } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import {
  webSearch_20250305,
  webSearch_20250305OutputSchema,
  WebSearch20250305Options,
} from './web-search_20250305';

describe('webSearch_20250305 tool type', () => {
  it('should return correct Tool type with explicit options', () => {
    const tool = webSearch_20250305({ maxUses: 5 });

    expectTypeOf(tool).toMatchTypeOf<
      Tool<{ query: string }, InferSchema<typeof webSearch_20250305OutputSchema>>
    >();
  });

  it('should return correct Tool type with empty options', () => {
    const tool = webSearch_20250305();

    expectTypeOf(tool).toMatchTypeOf<
      Tool<{ query: string }, InferSchema<typeof webSearch_20250305OutputSchema>>
    >();
  });

  it('should return correct Tool type with all options', () => {
    const tool = webSearch_20250305({
      maxUses: 5,
      allowedDomains: ['example.com'],
      blockedDomains: ['blocked.com'],
      userLocation: {
        type: 'approximate',
        city: 'New York',
        region: 'NY',
        country: 'USA',
        timezone: 'America/New_York',
      },
    });

    expectTypeOf(tool).toMatchTypeOf<
      Tool<{ query: string }, InferSchema<typeof webSearch_20250305OutputSchema>>
    >();
  });

  it('should have properly typed options interface', () => {
    const options: WebSearch20250305Options = {
      maxUses: 5,
    };

    expectTypeOf(options.maxUses).toEqualTypeOf<number | undefined>();
    expectTypeOf(options.allowedDomains).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(options.blockedDomains).toEqualTypeOf<string[] | undefined>();
  });
});
