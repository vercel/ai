import { describe, expect, it } from 'vitest';
import { addToolResultsToConversation } from './add-tool-results-to-conversation';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';

describe('addToolResultsToConversation', () => {
  it('correctly places multiple provider-executed tool results without shifting subsequent indices', () => {
    const messages: LanguageModelV4Prompt = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Step 1' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'tool1',
            input: {},
          },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'tool2',
            input: {},
          },
          { type: 'text', text: 'Step 2' },
        ],
      },
    ];

    addToolResultsToConversation({
      messages,
      toolResults: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool1',
          output: { type: 'text', value: 'res1' },
        },
        {
          type: 'tool-result',
          toolCallId: 'call-2',
          toolName: 'tool2',
          output: { type: 'text', value: 'res2' },
        },
      ],
      providerExecutedToolCallIds: new Set(['call-1', 'call-2']),
      providerExecutedToolResultPositions: [
        { toolCallId: 'call-1', contentIndex: 2 },
        { toolCallId: 'call-2', contentIndex: 3 },
      ],
    });

    const assistantContent = (messages[0] as { content: Array<any> }).content;
    expect(assistantContent).toEqual([
      { type: 'text', text: 'Step 1' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'tool1',
        input: {},
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'tool1',
        output: { type: 'text', value: 'res1' },
      },
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'tool2',
        input: {},
      },
      {
        type: 'tool-result',
        toolCallId: 'call-2',
        toolName: 'tool2',
        output: { type: 'text', value: 'res2' },
      },
      { type: 'text', text: 'Step 2' },
    ]);
  });

  it('preserves order when multiple positions share the same contentIndex', () => {
    const messages: LanguageModelV4Prompt = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'tool1',
            input: {},
          },
          { type: 'text', text: 'End' },
        ],
      },
    ];

    addToolResultsToConversation({
      messages,
      toolResults: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool1',
          output: { type: 'text', value: 'res1-a' },
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool1',
          output: { type: 'text', value: 'res1-b' },
        },
      ],
      providerExecutedToolCallIds: new Set(['call-1']),
      providerExecutedToolResultPositions: [
        { toolCallId: 'call-1', contentIndex: 1 },
        { toolCallId: 'call-1', contentIndex: 1 },
      ],
    });

    const assistantContent = (messages[0] as { content: Array<any> }).content;
    expect(assistantContent).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'tool1',
        input: {},
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'tool1',
        output: { type: 'text', value: 'res1-a' },
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'tool1',
        output: { type: 'text', value: 'res1-b' },
      },
      { type: 'text', text: 'End' },
    ]);
  });

  it('falls back to inserting after tool-call when positions are omitted', () => {
    const messages: LanguageModelV4Prompt = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'tool1',
            input: {},
          },
          { type: 'text', text: 'Done' },
        ],
      },
    ];

    addToolResultsToConversation({
      messages,
      toolResults: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool1',
          output: { type: 'text', value: 'res1' },
        },
      ],
      providerExecutedToolCallIds: new Set(['call-1']),
    });

    const assistantContent = (messages[0] as { content: Array<any> }).content;
    expect(assistantContent).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'tool1',
        input: {},
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'tool1',
        output: { type: 'text', value: 'res1' },
      },
      { type: 'text', text: 'Done' },
    ]);
  });

  it('appends client results in a separate tool message', () => {
    const messages: LanguageModelV4Prompt = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'client-call-1',
            toolName: 'toolClient',
            input: {},
          },
        ],
      },
    ];

    addToolResultsToConversation({
      messages,
      toolResults: [
        {
          type: 'tool-result',
          toolCallId: 'client-call-1',
          toolName: 'toolClient',
          output: { type: 'text', value: 'client-res' },
        },
      ],
      providerExecutedToolCallIds: new Set(),
    });

    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'client-call-1',
          toolName: 'toolClient',
          output: { type: 'text', value: 'client-res' },
        },
      ],
    });
  });
});
