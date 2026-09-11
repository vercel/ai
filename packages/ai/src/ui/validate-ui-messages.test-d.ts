import { openai } from '@ai-sdk/openai';
import { tool, type ToolSet } from '@ai-sdk/provider-utils';
import { describe, it } from 'vitest';
import { z } from 'zod/v4';
import type { InferUITools, UIMessage } from './ui-messages';
import {
  safeValidateUIMessages,
  validateUIMessages,
} from './validate-ui-messages';

describe('validateUIMessages types', () => {
  it('accepts an inferred function tool set', () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }) => `Weather in ${location}: sunny`,
      }),
    } satisfies ToolSet;

    validateUIMessages({ messages: [], tools });
    safeValidateUIMessages({ messages: [], tools });
  });

  it('accepts an inferred provider-executed tool set', () => {
    const tools = {
      code_interpreter: openai.tools.codeInterpreter(),
    } satisfies ToolSet;

    validateUIMessages({ messages: [], tools });
    safeValidateUIMessages({ messages: [], tools });
  });

  it('preserves explicitly specified UI message tool types', () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ location: z.string() }),
        outputSchema: z.string(),
      }),
    } satisfies ToolSet;
    type TestMessage = UIMessage<unknown, never, InferUITools<typeof tools>>;

    validateUIMessages<TestMessage>({ messages: [], tools });

    const mismatchedTools = {
      weather: tool({
        inputSchema: z.object({ latitude: z.number() }),
        outputSchema: z.string(),
      }),
    } satisfies ToolSet;

    // @ts-expect-error tool input does not match the UI message tool input
    validateUIMessages<TestMessage>({ messages: [], tools: mismatchedTools });
  });
});
