import { describe, it, expect } from 'vitest';
import { prepareConversationTools } from './mistral-conversation-prepare-tools';

describe('prepareConversationTools', () => {
  it('maps both search tools and warns about unsupported provider tools', () => {
    expect(
      prepareConversationTools({
        tools: [
          {
            type: 'provider',
            id: 'mistral.web_search',
            name: 'search',
            args: {},
          },
          {
            type: 'provider',
            id: 'mistral.web_search_premium',
            name: 'news',
            args: {},
          },
          {
            type: 'provider',
            id: 'mistral.unknown',
            name: 'unknown',
            args: {},
          },
        ],
      }),
    ).toEqual({
      tools: [{ type: 'web_search' }, { type: 'web_search_premium' }],
      toolChoice: undefined,
      toolWarnings: [
        {
          type: 'unsupported',
          feature: 'provider-defined tool mistral.unknown',
        },
      ],
    });
  });

  it('forces a function tool when search is also available', () => {
    expect(
      prepareConversationTools({
        tools: [
          {
            type: 'provider',
            id: 'mistral.web_search',
            name: 'search',
            args: {},
          },
          {
            type: 'function',
            name: 'weather',
            inputSchema: { type: 'object' },
          },
        ],
        toolChoice: { type: 'tool', toolName: 'weather' },
      }),
    ).toEqual({
      tools: [
        {
          type: 'function',
          function: {
            name: 'weather',
            description: undefined,
            parameters: { type: 'object' },
          },
        },
      ],
      toolChoice: 'any',
      toolWarnings: [],
    });
  });
});
