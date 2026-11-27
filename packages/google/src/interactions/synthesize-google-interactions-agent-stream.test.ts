import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import type { GoogleInteractionsResponse } from './google-interactions-api';
import { synthesizeGoogleInteractionsAgentStream } from './synthesize-google-interactions-agent-stream';

function synthesize(response: GoogleInteractionsResponse) {
  return convertReadableStreamToArray(
    synthesizeGoogleInteractionsAgentStream({
      response,
      warnings: [],
      generateId: () => 'test-id',
    }),
  );
}

describe('synthesizeGoogleInteractionsAgentStream', () => {
  it('keeps the tool search signatures a replayed turn depends on', async () => {
    const parts = await synthesize({
      id: 'v1_background',
      status: 'completed',
      steps: [
        {
          type: 'tool_search_call',
          id: 'search-1',
          arguments: { function_names: ['convertCurrency'] },
          signature: 'search-call-signature',
        },
        {
          type: 'tool_search_result',
          call_id: 'search-1',
          result: [{ type: 'function', name: 'convertCurrency' }],
          signature: 'search-result-signature',
        },
      ],
    } as unknown as GoogleInteractionsResponse);

    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'search-1',
      toolName: 'tool_search',
      input: '{"function_names":["convertCurrency"]}',
      providerExecuted: true,
      providerMetadata: {
        google: {
          signature: 'search-call-signature',
          interactionId: 'v1_background',
        },
      },
    });

    expect(parts).toContainEqual({
      type: 'tool-result',
      toolCallId: 'search-1',
      toolName: 'tool_search',
      result: [{ type: 'function', name: 'convertCurrency' }],
      providerMetadata: {
        google: {
          signature: 'search-result-signature',
          interactionId: 'v1_background',
        },
      },
    });
  });

  it('omits providerMetadata on tool results that carry none', async () => {
    const parts = await synthesize({
      id: 'v1_background',
      status: 'completed',
      steps: [
        {
          type: 'google_search_call',
          id: 'gs-1',
          arguments: { query: 'weather' },
        },
        {
          type: 'google_search_result',
          call_id: 'gs-1',
          result: [],
        },
      ],
    } as unknown as GoogleInteractionsResponse);

    const toolResult = parts.find(part => part.type === 'tool-result');
    expect(toolResult).not.toHaveProperty('providerMetadata');
  });
});
