import { z } from 'zod/v4';
import { tool } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { prepareToolChoice } from './prepare-tool-choice';

const mockTools = {
  tool1: tool({
    description: 'Tool 1 description',
    inputSchema: z.object({}),
  }),
  tool2: tool({
    description: 'Tool 2 description',
    inputSchema: z.object({ city: z.string() }),
  }),
};

describe('prepareToolChoice', () => {
  it('returns undefined when tools are not provided', () => {
    const result = prepareToolChoice({
      toolChoice: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "type": "auto",
      }
    `);
  });

  it('returns auto when tool choice is not provided', () => {
    const result = prepareToolChoice({
      toolChoice: undefined,
    });

    expect(result).toEqual({ type: 'auto' });
  });

  it('handles string tool choice', () => {
    const result = prepareToolChoice({
      toolChoice: 'none',
    });

    expect(result).toEqual({ type: 'none' });
  });

  it('handles object tool choice', () => {
    const result = prepareToolChoice({
      toolChoice: { type: 'tool', toolName: 'tool2' },
    });

    expect(result).toEqual({ type: 'tool', toolName: 'tool2' });
  });
});
