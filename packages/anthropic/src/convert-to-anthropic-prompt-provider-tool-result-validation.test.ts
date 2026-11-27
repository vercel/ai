import {
  InvalidPromptError,
  TypeValidationError,
  type JSONValue,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { createToolNameMapping } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { convertToAnthropicPrompt } from './convert-to-anthropic-prompt';

const toolNameMapping = createToolNameMapping({
  tools: [],
  providerToolNames: {},
});

function promptWithProviderToolResult(
  toolName: string,
  value: JSONValue,
): LanguageModelV4Prompt {
  return [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Find the latest news.' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'tool-1',
          toolName,
          input: { query: 'news' },
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-1',
          toolName,
          output: { type: 'json', value },
        },
      ],
    },
  ];
}

describe('convertToAnthropicPrompt provider-executed tool result validation', () => {
  it.each([
    {
      toolName: 'web_search',
      value: {
        id: 'search-1',
        results: [{ title: 'Result', url: 'https://example.com' }],
      },
    },
    { toolName: 'web_fetch', value: { url: 'https://example.com' } },
    { toolName: 'tool_search_tool_regex', value: { toolName: 'get_weather' } },
  ])(
    'throws InvalidPromptError when a $toolName result does not match its output schema',
    async ({ toolName, value }) => {
      const error = await convertToAnthropicPrompt({
        prompt: promptWithProviderToolResult(toolName, value),
        sendReasoning: true,
        warnings: [],
        toolNameMapping,
      }).catch((caught: unknown) => caught);

      expect(InvalidPromptError.isInstance(error)).toBe(true);
      expect((error as InvalidPromptError).message).toContain(
        `tool '${toolName}'`,
      );
      expect(
        TypeValidationError.isInstance((error as InvalidPromptError).cause),
      ).toBe(true);
    },
  );
});
