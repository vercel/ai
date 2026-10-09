import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { createToolNameMapping } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { convertToMistralConversationInputs } from './convert-to-mistral-conversation-inputs';
import { mistralProviderToolNames } from './mistral-conversation-prepare-tools';

const mapping = createToolNameMapping({
  tools: [
    {
      type: 'provider',
      id: 'mistral.web_search_premium',
      name: 'news',
      args: {},
    },
  ],
  providerToolNames: mistralProviderToolNames,
});

describe('convertToMistralConversationInputs', () => {
  it('omits entry IDs on replay while preserving function tool-call IDs', () => {
    const { inputs } = convertToMistralConversationInputs(
      [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'tool_exec_search',
              toolName: 'news',
              providerExecuted: true,
              providerOptions: { mistral: { function: 'web_search' } },
              input: { arguments: '{"query":"news"}' },
            },
            {
              type: 'tool-result',
              toolCallId: 'tool_exec_search',
              toolName: 'news',
              output: {
                type: 'json',
                value: { info: { result: 'search context' } },
              },
            },
            {
              type: 'tool-call',
              toolCallId: 'function-1',
              toolName: 'weather',
              input: { city: 'Paris' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'function-1',
              toolName: 'weather',
              output: { type: 'text', value: 'Sunny' },
            },
          ],
        },
      ],
      mapping,
    );
    for (const input of inputs) {
      expect(input).not.toHaveProperty('id');
    }
    expect(inputs[0]).toEqual({
      type: 'function.call',
      tool_call_id: 'tool_exec_search',
      name: 'web_search',
      arguments: '{"query":"news"}',
    });
    expect(inputs[1]).toEqual({
      type: 'function.result',
      tool_call_id: 'tool_exec_search',
      result: 'search context',
    });
    expect(inputs[2]).toMatchObject({
      type: 'function.call',
      tool_call_id: 'function-1',
    });
    expect(inputs[3]).toMatchObject({
      type: 'function.result',
      tool_call_id: 'function-1',
    });
  });
  it('preserves message order, reasoning, and function results within assistant messages', () => {
    expect(
      convertToMistralConversationInputs(
        [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Before' },
              { type: 'reasoning', text: 'Think' },
              {
                type: 'tool-call',
                toolCallId: 'function-1',
                toolName: 'weather',
                input: { city: 'Paris' },
              },
              {
                type: 'tool-result',
                toolCallId: 'function-1',
                toolName: 'weather',
                output: { type: 'text', value: 'Sunny' },
              },
              { type: 'text', text: 'After' },
            ],
          },
        ],
        mapping,
      ).inputs,
    ).toEqual([
      {
        type: 'message.input',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Before' },
          {
            type: 'thinking',
            thinking: [{ type: 'text', text: 'Think' }],
            closed: true,
          },
        ],
      },
      {
        type: 'function.call',
        tool_call_id: 'function-1',
        name: 'weather',
        arguments: '{"city":"Paris"}',
      },
      { type: 'function.result', tool_call_id: 'function-1', result: 'Sunny' },
      {
        type: 'message.input',
        role: 'assistant',
        content: [{ type: 'text', text: 'After' }],
      },
    ]);
  });

  it('replays renamed premium search as function calls and results', () => {
    expect(
      convertToMistralConversationInputs(
        [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'search-1',
                toolName: 'news',
                providerExecuted: true,
                input: { arguments: 'news query' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'search-1',
                toolName: 'news',
                output: {
                  type: 'json',
                  value: { info: { documents: ['result'] } },
                },
              },
            ],
          },
          { role: 'assistant', content: [{ type: 'text', text: 'The news' }] },
        ],
        mapping,
      ).inputs,
    ).toEqual([
      {
        type: 'function.call',
        tool_call_id: 'search-1',
        name: 'web_search_premium',
        arguments: 'news query',
      },
      {
        type: 'function.result',
        tool_call_id: 'search-1',
        result: '{"documents":["result"]}',
      },
      {
        type: 'message.input',
        role: 'assistant',
        content: [{ type: 'text', text: 'The news' }],
      },
    ]);
  });

  it('keeps images and PDFs in user messages', () => {
    expect(
      convertToMistralConversationInputs(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Search for context' },
              {
                type: 'file',
                mediaType: 'image/png',
                data: {
                  type: 'url',
                  url: new URL('https://example.com/image.png'),
                },
              },
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: {
                  type: 'url',
                  url: new URL('https://example.com/document.pdf'),
                },
              },
            ],
          },
        ],
        mapping,
      ).inputs,
    ).toEqual([
      {
        type: 'message.input',
        role: 'user',
        content: [
          { type: 'text', text: 'Search for context' },
          { type: 'image_url', image_url: 'https://example.com/image.png' },
          {
            type: 'document_url',
            document_url: 'https://example.com/document.pdf',
          },
        ],
      },
    ]);
  });

  it('does not silently drop unsupported assistant content', () => {
    expect(() =>
      convertToMistralConversationInputs(
        [
          {
            role: 'assistant',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: new Uint8Array() },
              },
            ],
          },
        ],
        mapping,
      ),
    ).toThrow(UnsupportedFunctionalityError);
  });
});
