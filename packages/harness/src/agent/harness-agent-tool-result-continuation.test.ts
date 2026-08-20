import type { ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expect, test } from 'vitest';
import { collectHarnessAgentToolResultContinuations } from './harness-agent-tool-result-continuation';

describe('collectHarnessAgentToolResultContinuations', () => {
  test('collects results only from the trailing tool message', () => {
    const messages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'old',
            toolName: 'weather',
            output: { type: 'json', value: { celsius: 18 } },
          },
        ],
      },
      { role: 'user', content: 'continue' },
    ];

    expect(collectHarnessAgentToolResultContinuations({ messages })).toEqual(
      [],
    );
  });

  test('converts model output wrappers into harness results', () => {
    const messages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'text',
            toolName: 'tool',
            output: { type: 'text', value: 'done' },
          },
          {
            type: 'tool-result',
            toolCallId: 'json',
            toolName: 'tool',
            output: { type: 'json', value: { done: true } },
          },
          {
            type: 'tool-result',
            toolCallId: 'error-text',
            toolName: 'tool',
            output: { type: 'error-text', value: 'failed' },
          },
          {
            type: 'tool-result',
            toolCallId: 'error-json',
            toolName: 'tool',
            output: { type: 'error-json', value: { message: 'failed' } },
          },
          {
            type: 'tool-result',
            toolCallId: 'denied',
            toolName: 'tool',
            output: { type: 'execution-denied', reason: 'not allowed' },
          },
          {
            type: 'tool-result',
            toolCallId: 'content',
            toolName: 'tool',
            output: {
              type: 'content',
              value: [{ type: 'text', text: 'structured' }],
            },
          },
        ],
      },
    ];

    expect(collectHarnessAgentToolResultContinuations({ messages })).toEqual([
      { toolCallId: 'text', output: 'done' },
      { toolCallId: 'json', output: { done: true } },
      { toolCallId: 'error-text', output: 'failed', isError: true },
      {
        toolCallId: 'error-json',
        output: { message: 'failed' },
        isError: true,
      },
      {
        toolCallId: 'denied',
        output: { type: 'execution-denied', reason: 'not allowed' },
      },
      {
        toolCallId: 'content',
        output: {
          type: 'content',
          value: [{ type: 'text', text: 'structured' }],
        },
      },
    ]);
  });
});
