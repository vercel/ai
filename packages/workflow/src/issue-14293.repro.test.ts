import type { LanguageModelV4Prompt, LanguageModelV4ToolResultPart } from '@ai-sdk/provider';
import type { Experimental_LanguageModelStreamPart, StepResult, ToolSet } from 'ai';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./do-stream-step.js', () => ({
  doStreamStep: vi.fn(),
}));

const { streamTextIterator } = await import('./stream-text-iterator.js');
const { doStreamStep } = await import('./do-stream-step.js');

function createMockWritable(): WritableStream<
  Experimental_LanguageModelStreamPart<ToolSet>
> {
  return new WritableStream({
    write: vi.fn(),
    close: vi.fn(),
  });
}

const usage = {
  inputTokens: 1,
  inputTokenDetails: {
    noCacheTokens: undefined,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  },
  outputTokens: 1,
  outputTokenDetails: {
    textTokens: undefined,
    reasoningTokens: undefined,
  },
  totalTokens: 2,
};

function createStepResult(
  overrides: Partial<StepResult<ToolSet, never>> = {},
): StepResult<ToolSet, never> {
  return {
    content: [],
    text: '',
    reasoning: [],
    reasoningText: undefined,
    files: [],
    sources: [],
    toolCalls: [],
    staticToolCalls: [],
    dynamicToolCalls: [],
    toolResults: [],
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: 'stop',
    usage,
    warnings: [],
    request: { body: '' },
    response: {
      id: 'response-1',
      timestamp: new Date(0),
      modelId: 'mock-model',
      messages: [],
    },
    providerMetadata: {},
    ...overrides,
  } as StepResult<ToolSet, never>;
}

function createDoStreamStepResult({
  toolCalls = [],
  finishReason = 'stop',
  stepOverrides = {},
}: {
  toolCalls?: Array<Record<string, unknown>>;
  finishReason?: 'stop' | 'tool-calls';
  stepOverrides?: Partial<StepResult<ToolSet, never>>;
}) {
  return {
    toolCalls,
    finish: {
      finishReason,
      rawFinishReason: finishReason === 'tool-calls' ? 'tool_calls' : 'stop',
      usage,
    },
    step: createStepResult({ finishReason, ...stepOverrides }),
    providerExecutedToolResults: new Map(),
  };
}

describe('issue #14293 reproduction', () => {
  it('WorkflowAgent prompt for the next turn drops assistant reasoning items before tool calls', async () => {
    let secondTurnPrompt: LanguageModelV4Prompt | undefined;

    vi.mocked(doStreamStep)
      .mockResolvedValueOnce(
        createDoStreamStepResult({
          finishReason: 'tool-calls',
          toolCalls: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: { query: 'weather' },
              providerMetadata: {
                openai: {
                  itemId: 'fc_requires_prior_reasoning_item',
                },
              },
            },
          ],
          stepOverrides: {
            reasoning: [
              {
                type: 'reasoning',
                text: 'I need to call the lookup tool.',
                providerMetadata: {
                  openai: {
                    itemId: 'rs_reasoning_item_1',
                    reasoningEncryptedContent: 'encrypted-reasoning',
                  },
                },
              } as never,
            ],
            reasoningText: 'I need to call the lookup tool.',
          },
        }),
      )
      .mockImplementationOnce(async prompt => {
        secondTurnPrompt = prompt;
        return createDoStreamStepResult({ finishReason: 'stop' });
      });

    const iterator = streamTextIterator({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      tools: {
        lookup: {
          description: 'lookup information',
          execute: async () => ({ ok: true }),
        },
      } as unknown as ToolSet,
      writable: createMockWritable(),
      model: { provider: 'mock', modelId: 'mock' } as never,
    });

    const first = await iterator.next();
    expect(first.done).toBe(false);

    const toolResults: LanguageModelV4ToolResultPart[] = [
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'lookup',
        output: { type: 'json', value: { ok: true } },
      },
    ];

    await iterator.next(toolResults);

    const assistantMessage = secondTurnPrompt?.find(
      message => message.role === 'assistant',
    );
    const assistantContent = assistantMessage?.content as
      | Array<Record<string, unknown>>
      | undefined;

    expect(assistantContent).toBeDefined();

    // Reproduction assertion: the next provider call should retain the
    // reasoning item that preceded the tool call, including provider metadata
    // needed to make OpenAI itemId references valid across turns. The current
    // WorkflowAgent implementation only writes the tool-call part, so this
    // assertion fails and demonstrates issue #14293.
    expect(assistantContent).toEqual([
      {
        type: 'reasoning',
        text: 'I need to call the lookup tool.',
        providerOptions: {
          openai: {
            itemId: 'rs_reasoning_item_1',
            reasoningEncryptedContent: 'encrypted-reasoning',
          },
        },
      },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'lookup',
        input: { query: 'weather' },
        providerOptions: {
          openai: {
            itemId: 'fc_requires_prior_reasoning_item',
          },
        },
      },
    ]);
  });
});
