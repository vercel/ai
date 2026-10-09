import { readFileSync } from 'node:fs';
import type { ToolNameMapping } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { convertToOpenAIResponsesInput } from './convert-to-openai-responses-input';

const toolNameMapping: ToolNameMapping = {
  toProviderToolName: toolName => toolName,
  toCustomToolName: toolName => toolName,
};

const fixture = JSON.parse(
  readFileSync(
    new URL(
      './__fixtures__/issue-22343-live-web-search-store-false.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  request: {
    input: Array<{
      type?: string;
      id?: string;
      status?: string;
      action?: {
        type: 'search';
        query?: string;
        queries?: string[];
        sources?: Array<{ type: 'url'; url: string }>;
      };
    }>;
  };
};

describe('convertToOpenAIResponsesInput web search replay', () => {
  it('replays the live provider web_search_call when store is false', async () => {
    const liveWebSearchCall = fixture.request.input.find(
      item => item.type === 'web_search_call',
    );

    expect(liveWebSearchCall).toBeDefined();

    const result = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: liveWebSearchCall!.id!,
              toolName: 'web_search',
              input: {},
              providerExecuted: true,
            },
            {
              type: 'tool-result',
              toolCallId: liveWebSearchCall!.id!,
              toolName: 'web_search',
              output: {
                type: 'json',
                value: {
                  action: {
                    type: 'search',
                    query: liveWebSearchCall!.action!.query,
                    queries: liveWebSearchCall!.action!.queries,
                  },
                  sources: liveWebSearchCall!.action!.sources,
                },
              },
            },
          ],
        },
      ],
      toolNameMapping,
      systemMessageMode: 'system',
      providerOptionsName: 'openai',
      store: false,
    });

    expect(result.input).toContainEqual(liveWebSearchCall);
    expect(result.warnings).toEqual([]);
  });

  it('keeps warning and dropping a result without an action', async () => {
    const result = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'ws_missing_action',
              toolName: 'web_search',
              output: { type: 'json', value: {} },
            },
          ],
        },
      ],
      toolNameMapping,
      systemMessageMode: 'system',
      providerOptionsName: 'openai',
      store: false,
    });

    expect(result.input).toEqual([]);
    expect(result.warnings).toEqual([
      {
        type: 'other',
        message:
          'Results for OpenAI tool web_search are not sent to the API when store is false',
      },
    ]);
  });

  it('keeps warning and dropping a non-json result', async () => {
    const result = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'ws_text_output',
              toolName: 'web_search',
              output: { type: 'text', value: 'not replayable' },
            },
          ],
        },
      ],
      toolNameMapping,
      systemMessageMode: 'system',
      providerOptionsName: 'openai',
      store: false,
    });

    expect(result.input).toEqual([]);
    expect(result.warnings).toEqual([
      {
        type: 'other',
        message:
          'Results for OpenAI tool web_search are not sent to the API when store is false',
      },
    ]);
  });
});
