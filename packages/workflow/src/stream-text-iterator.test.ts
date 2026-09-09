/**
 * Tests for streamTextIterator
 *
 * These tests verify that providerMetadata from tool calls is correctly
 * mapped to providerOptions in the conversation prompt, which is critical
 * for providers like Gemini that require thoughtSignature to be preserved
 * across multi-turn tool calls.
 */
import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolCall,
  LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';
import {
  tool,
  type Experimental_LanguageModelStreamPart,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from 'ai';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';
import type {
  DoStreamStepRawResult,
  ParsedToolCall,
} from './do-stream-step.js';
import type { StreamTextIteratorYieldValue } from './stream-text-iterator.js';

// Mock doStreamStep
vi.mock('./do-stream-step.js', () => ({
  doStreamStep: vi.fn(),
}));

// Import after mocking
const { streamTextIterator } = await import('./stream-text-iterator.js');
const { doStreamStep } = await import('./do-stream-step.js');

/**
 * Helper to create a mock writable stream
 */
function createMockWritable(): WritableStream<
  Experimental_LanguageModelStreamPart<ToolSet>
> {
  return new WritableStream({
    write: vi.fn(),
    close: vi.fn(),
  });
}

const mockUsage = {
  inputTokens: 10,
  inputTokenDetails: {
    noCacheTokens: undefined,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  },
  outputTokens: 5,
  outputTokenDetails: {
    textTokens: undefined,
    reasoningTokens: undefined,
  },
  totalTokens: 15,
};

function createMockFinish(
  finishReason: 'stop' | 'tool-calls' = 'stop',
  rawFinishReason: string = 'stop',
  providerMetadata?: Record<string, Record<string, unknown>>,
) {
  return {
    finishReason,
    rawFinishReason,
    usage: mockUsage,
    providerMetadata,
  };
}

function createMockDoStreamStepResult({
  toolCalls = [] as ParsedToolCall[],
  toolInputLifecycleEvents = [],
  finishReason = 'stop' as 'stop' | 'tool-calls',
  finishRaw = 'stop',
  providerMetadata,
  rawOverrides = {},
}: {
  toolCalls?: ParsedToolCall[];
  toolInputLifecycleEvents?: Array<
    | ['start', toolCallId: string, toolName: string]
    | ['delta', toolCallId: string, inputTextDelta: string]
    | ['available', toolCallId: string]
  >;
  finishReason?: 'stop' | 'tool-calls';
  finishRaw?: string;
  providerMetadata?: Record<string, Record<string, unknown>>;
  rawOverrides?: Partial<DoStreamStepRawResult>;
} = {}) {
  return {
    toolCalls,
    finish: createMockFinish(finishReason, finishRaw, providerMetadata),
    // doStreamStep now returns minimal raw aggregates; the iterator
    // reconstructs the StepResult via buildStepResult.
    raw: {
      content: [],
      reasoning: [],
      responseMetadata: undefined,
      warnings: [],
      ...rawOverrides,
    } as DoStreamStepRawResult,
    providerExecutedToolResults: new Map(),
    toolInputLifecycleEvents,
  };
}

describe('streamTextIterator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replays tool input callbacks in order before advancing the agent step', async () => {
    const callbacks: string[] = [];
    vi.mocked(doStreamStep).mockImplementation(async () => {
      callbacks.push('model-step-finished');
      return createMockDoStreamStepResult({
        finishReason: 'tool-calls',
        toolCalls: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'search',
            input: { query: 'docs' },
          },
        ],
        toolInputLifecycleEvents: [
          ['start', 'call-1', 'search'],
          ['delta', 'call-1', '{"query":"docs"}'],
          ['available', 'call-1'],
        ],
      });
    });

    const iterator = streamTextIterator({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'search' }] }],
      tools: {
        search: {
          inputSchema: jsonSchema({
            type: 'object',
            properties: { query: { type: 'string' } },
          }),
          onInputStart: ({ context }) => {
            callbacks.push(`start:${String((context as any).requestId)}`);
          },
          onInputDelta: ({ inputTextDelta }) => {
            callbacks.push(`delta:${inputTextDelta}`);
          },
          onInputAvailable: ({ input }: { input: unknown }) => {
            callbacks.push(`available:${JSON.stringify(input)}`);
          },
        },
      },
      toolsContext: { search: { requestId: 'request-1' } },
      model: vi.fn() as any,
    });

    await iterator.next();

    expect(callbacks).toEqual([
      'model-step-finished',
      'start:request-1',
      'delta:{"query":"docs"}',
      'available:{"query":"docs"}',
    ]);
  });

  it('validates and normalizes tool context before input callbacks', async () => {
    const callback = vi.fn();
    vi.mocked(doStreamStep).mockResolvedValue(
      createMockDoStreamStepResult({
        finishReason: 'tool-calls',
        toolCalls: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'search',
            input: { query: 'docs' },
          },
        ],
        toolInputLifecycleEvents: [['start', 'call-1', 'search']],
      }),
    );

    const iterator = streamTextIterator({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'search' }] }],
      tools: {
        search: tool({
          inputSchema: z.object({ query: z.string() }),
          contextSchema: z.object({
            requestId: z.string().default('generated-request'),
          }),
          onInputStart: callback,
        }),
      },
      toolsContext: { search: {} },
      model: vi.fn() as any,
    });

    await iterator.next();

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { requestId: 'generated-request' },
      }),
    );
  });

  it('rejects invalid tool context before input callbacks run', async () => {
    const callback = vi.fn();
    vi.mocked(doStreamStep).mockResolvedValue(
      createMockDoStreamStepResult({
        finishReason: 'tool-calls',
        toolCalls: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'search',
            input: { query: 'docs' },
          },
        ],
        toolInputLifecycleEvents: [['start', 'call-1', 'search']],
      }),
    );

    const iterator = streamTextIterator({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'search' }] }],
      tools: {
        search: tool({
          inputSchema: z.object({ query: z.string() }),
          contextSchema: z.object({ requestId: z.string() }),
          onInputStart: callback,
        }),
      },
      toolsContext: { search: { requestId: 123 } as any },
      model: vi.fn() as any,
    });

    await expect(iterator.next()).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  it('accepts persisted model-step results without callback replay data', async () => {
    const persistedResult = createMockDoStreamStepResult();
    delete (persistedResult as { toolInputLifecycleEvents?: unknown })
      .toolInputLifecycleEvents;
    vi.mocked(doStreamStep).mockResolvedValue(persistedResult);

    const iterator = streamTextIterator({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      tools: {},
      model: vi.fn() as any,
    });

    await expect(iterator.next()).resolves.toMatchObject({ done: false });
  });

  describe('generation settings', () => {
    it('merges defined prepareStep overrides', async () => {
      vi.mocked(doStreamStep).mockResolvedValue(createMockDoStreamStepResult());

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {},
        model: vi.fn() as any,
        generationSettings: {
          temperature: 0.2,
          topP: 0.5,
        },
        prepareStep: () => ({
          temperature: undefined,
          topP: 0.9,
          maxOutputTokens: 256,
        }),
      });

      await iterator.next();

      expect(vi.mocked(doStreamStep).mock.calls[0]?.[4]).toMatchObject({
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 256,
      });
    });

    it('passes the absolute timeout deadline across the step boundary', async () => {
      vi.mocked(doStreamStep).mockResolvedValue(createMockDoStreamStepResult());
      const timeoutAt = Date.now() + 5000;

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {},
        model: vi.fn() as any,
        timeoutAt,
      });

      await iterator.next();

      expect(vi.mocked(doStreamStep).mock.calls[0]?.[4]).toMatchObject({
        timeoutAt,
      });
    });

    it('returns an aborted result without reporting an error', async () => {
      vi.mocked(doStreamStep).mockResolvedValue({ aborted: true });
      const onError = vi.fn();
      const prompt: LanguageModelV4Prompt = [
        { role: 'user', content: [{ type: 'text', text: 'test' }] },
      ];

      const iterator = streamTextIterator({
        prompt,
        tools: {},
        model: vi.fn() as any,
        onError,
      });

      await expect(iterator.next()).resolves.toEqual({
        done: true,
        value: { aborted: true, messages: prompt },
      });
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('activeTools', () => {
    it('passes no tools to the model when prepareStep returns an empty list', async () => {
      vi.mocked(doStreamStep).mockResolvedValue(createMockDoStreamStepResult());

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          hidden: tool({
            inputSchema: z.object({}),
          }),
        },
        model: vi.fn() as any,
        prepareStep: () => ({ activeTools: [] }),
      });

      await iterator.next();

      expect(doStreamStep).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Function),
        undefined,
        {},
        expect.any(Object),
      );
    });
  });

  describe('telemetry', () => {
    it('should expose provider metadata on model-call end', async () => {
      vi.mocked(doStreamStep).mockResolvedValue(
        createMockDoStreamStepResult({
          providerMetadata: {
            gateway: { generationId: 'generation-id' },
          },
        }),
      );
      const onLanguageModelCallEnd = vi.fn();

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {},
        model: vi.fn() as any,
        telemetry: {
          integrations: {
            onLanguageModelCallEnd,
          },
        },
      });

      await iterator.next();

      expect(onLanguageModelCallEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          providerMetadata: {
            gateway: { generationId: 'generation-id' },
          },
        }),
      );
    });
  });

  describe('conversation prompt', () => {
    it('passes initial instructions and messages to prepareStep', async () => {
      vi.mocked(doStreamStep).mockResolvedValueOnce(
        createMockDoStreamStepResult(),
      );
      const initialMessages: ModelMessage[] = [
        { role: 'user', content: 'initial message' },
      ];
      const prepareStep = vi.fn(() => ({}));

      const iterator = streamTextIterator({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'initial message' }],
          },
        ],
        initialInstructions: 'initial instructions',
        initialMessages,
        tools: {},
        model: vi.fn() as any,
        prepareStep,
      });

      await iterator.next();

      expect(prepareStep).toHaveBeenCalledWith(
        expect.objectContaining({
          initialInstructions: 'initial instructions',
          initialMessages,
        }),
      );
    });

    it('preserves assistant text alongside tool calls for the next step', async () => {
      let capturedPrompt: LanguageModelV4Prompt | undefined;

      vi.mocked(doStreamStep)
        .mockResolvedValueOnce(
          createMockDoStreamStepResult({
            toolCalls: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'testTool',
                input: { query: 'test' },
              },
            ],
            finishReason: 'tool-calls',
            finishRaw: 'tool_calls',
            rawOverrides: {
              content: [
                {
                  type: 'text',
                  text: 'I found the answer before calling the tool.',
                },
                { type: 'tool-call', toolCallIndex: 0 },
              ],
            },
          }),
        )
        .mockImplementationOnce(async prompt => {
          capturedPrompt = prompt;
          return createMockDoStreamStepResult();
        });

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          testTool: {
            description: 'A test tool',
            execute: async () => ({ result: 'success' }),
          },
        } as unknown as ToolSet,
        writable: createMockWritable(),
        model: vi.fn() as any,
      });

      await iterator.next();
      await iterator.next([
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'testTool',
          output: { type: 'text', value: '{"result":"success"}' },
        },
      ]);

      expect(capturedPrompt).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "test",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "content": [
              {
                "text": "I found the answer before calling the tool.",
                "type": "text",
              },
              {
                "input": {
                  "query": "test",
                },
                "toolCallId": "call-1",
                "toolName": "testTool",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "text",
                  "value": "{"result":"success"}",
                },
                "toolCallId": "call-1",
                "toolName": "testTool",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
    });

    it('preserves generated files in the assistant message history', async () => {
      vi.mocked(doStreamStep).mockResolvedValueOnce(
        createMockDoStreamStepResult({
          rawOverrides: {
            content: [
              { type: 'text', text: 'Download the generated file.' },
              {
                type: 'file',
                data: 'ZmlsZS1jb250ZW50',
                mediaType: 'text/plain',
              },
            ],
          },
        }),
      );

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {},
        model: vi.fn() as any,
      });

      const result = await iterator.next();
      const yielded = result.value as StreamTextIteratorYieldValue;

      expect(yielded.step?.files).toHaveLength(1);
      expect(yielded.step?.files[0]?.base64).toBe('ZmlsZS1jb250ZW50');
      expect(yielded.messages.at(-1)).toEqual({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Download the generated file.' },
          {
            type: 'file',
            data: { type: 'data', data: 'ZmlsZS1jb250ZW50' },
            mediaType: 'text/plain',
          },
        ],
      });
    });

    it('preserves sources in step results without adding them to message history', async () => {
      const source = {
        type: 'source' as const,
        sourceType: 'url' as const,
        id: 'source-1',
        url: 'https://example.com/source',
        title: 'Example source',
      };
      vi.mocked(doStreamStep).mockResolvedValueOnce(
        createMockDoStreamStepResult({
          rawOverrides: {
            content: [{ type: 'text', text: 'Answer with a source.' }, source],
          },
        }),
      );

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {},
        model: vi.fn() as any,
      });

      const result = await iterator.next();
      const yielded = result.value as StreamTextIteratorYieldValue;

      expect(yielded.step?.content).toContainEqual(source);
      expect(yielded.step?.sources).toEqual([source]);
      expect(yielded.messages.at(-1)).toEqual({
        role: 'assistant',
        content: [{ type: 'text', text: 'Answer with a source.' }],
      });
    });

    it('preserves file and text order in a subsequent tool-call turn', async () => {
      let capturedPrompt: LanguageModelV4Prompt | undefined;
      const toolCall: ParsedToolCall = {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'testTool',
        input: { query: 'test' },
      };

      vi.mocked(doStreamStep)
        .mockResolvedValueOnce(
          createMockDoStreamStepResult({
            toolCalls: [toolCall],
            finishReason: 'tool-calls',
            finishRaw: 'tool_calls',
            rawOverrides: {
              content: [
                {
                  type: 'file',
                  data: 'ZmlsZS1iZWZvcmUtdGV4dA==',
                  mediaType: 'text/plain',
                },
                { type: 'text', text: 'Use this file.' },
                { type: 'tool-call', toolCallIndex: 0 },
              ],
            },
          }),
        )
        .mockImplementationOnce(async prompt => {
          capturedPrompt = prompt;
          return createMockDoStreamStepResult();
        });

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          testTool: {
            description: 'A test tool',
            execute: async () => ({ result: 'success' }),
          },
        } as unknown as ToolSet,
        model: vi.fn() as any,
      });

      await iterator.next();
      await iterator.next([
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'testTool',
          output: { type: 'text', value: '{"result":"success"}' },
        },
      ]);

      expect(
        capturedPrompt?.find(message => message.role === 'assistant'),
      ).toEqual({
        role: 'assistant',
        content: [
          {
            type: 'file',
            data: { type: 'data', data: 'ZmlsZS1iZWZvcmUtdGV4dA==' },
            mediaType: 'text/plain',
          },
          { type: 'text', text: 'Use this file.' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'testTool',
            input: { query: 'test' },
          },
        ],
      });
    });

    it('omits empty text from file-bearing tool-call message history', async () => {
      let capturedPrompt: LanguageModelV4Prompt | undefined;
      const toolCall: ParsedToolCall = {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'testTool',
        input: { query: 'test' },
      };

      vi.mocked(doStreamStep)
        .mockResolvedValueOnce(
          createMockDoStreamStepResult({
            toolCalls: [toolCall],
            finishReason: 'tool-calls',
            finishRaw: 'tool_calls',
            rawOverrides: {
              content: [
                {
                  type: 'file',
                  data: 'ZmlsZS1jb250ZW50',
                  mediaType: 'text/plain',
                },
                { type: 'text', text: '' },
                { type: 'tool-call', toolCallIndex: 0 },
              ],
            },
          }),
        )
        .mockImplementationOnce(async prompt => {
          capturedPrompt = prompt;
          return createMockDoStreamStepResult();
        });

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          testTool: {
            description: 'A test tool',
            execute: async () => ({ result: 'success' }),
          },
        } as unknown as ToolSet,
        model: vi.fn() as any,
      });

      const firstResult = await iterator.next();
      const yielded = firstResult.value as StreamTextIteratorYieldValue;
      const expectedAssistantMessage: LanguageModelV4Prompt[number] = {
        role: 'assistant',
        content: [
          {
            type: 'file',
            data: { type: 'data', data: 'ZmlsZS1jb250ZW50' },
            mediaType: 'text/plain',
          },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'testTool',
            input: { query: 'test' },
          },
        ],
      };

      expect(yielded.step?.content).toEqual([
        expect.objectContaining({ type: 'file' }),
        { type: 'text', text: '' },
        expect.objectContaining({
          type: 'tool-call',
          toolCallId: 'call-1',
        }),
      ]);
      expect(
        yielded.messages.find(message => message.role === 'assistant'),
      ).toEqual(expectedAssistantMessage);

      await iterator.next([
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'testTool',
          output: { type: 'text', value: '{"result":"success"}' },
        },
      ]);

      expect(
        capturedPrompt?.find(message => message.role === 'assistant'),
      ).toEqual(expectedAssistantMessage);
    });
  });

  describe('providerMetadata to providerOptions mapping', () => {
    it('should preserve providerMetadata as providerOptions in tool-call messages', async () => {
      const mockWritable = createMockWritable();
      const mockModel = vi.fn();

      // Capture the conversation prompt passed to subsequent doStreamStep calls
      let capturedPrompt: LanguageModelV4Prompt | undefined;

      const toolCallWithMetadata: LanguageModelV4ToolCall = {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'testTool',
        input: '{"query":"test"}',
        providerMetadata: {
          google: {
            thoughtSignature: 'sig_abc123_test_signature',
          },
        },
      };

      // First call returns tool-calls with providerMetadata
      // Second call (after tool results) should receive the updated prompt
      vi.mocked(doStreamStep)
        .mockResolvedValueOnce(
          createMockDoStreamStepResult({
            toolCalls: [toolCallWithMetadata],
            finishReason: 'tool-calls',
            finishRaw: 'tool_calls',
          }),
        )
        .mockImplementationOnce(
          async (prompt, _modelInit, _writable, _tools, _options) => {
            // Capture the prompt on the second call to verify providerOptions
            capturedPrompt = prompt;
            return createMockDoStreamStepResult();
          },
        );

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          testTool: {
            description: 'A test tool',
            execute: async () => ({ result: 'success' }),
          },
        } as unknown as ToolSet,
        writable: mockWritable,
        model: mockModel as any,
      });

      // First iteration - get tool calls
      const firstResult = await iterator.next();
      expect(firstResult.done).toBe(false);
      const firstValue = firstResult.value as StreamTextIteratorYieldValue;
      expect(firstValue.toolCalls).toHaveLength(1);

      // Provide tool results and continue
      const toolResults: LanguageModelV4ToolResultPart[] = [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'testTool',
          output: { type: 'text', value: '{"result":"success"}' },
        },
      ];

      // Second iteration - should trigger second doStreamStep call
      await iterator.next(toolResults);

      // Verify the captured prompt contains providerOptions
      expect(capturedPrompt).toBeDefined();

      // Find the assistant message with tool calls
      const assistantMessage = capturedPrompt?.find(
        msg => msg.role === 'assistant',
      );
      expect(assistantMessage).toBeDefined();

      // Verify the tool-call part has providerOptions mapped from providerMetadata
      const toolCallPart = (assistantMessage?.content as any[])?.find(
        part => part.type === 'tool-call',
      );
      expect(toolCallPart).toBeDefined();
      expect(toolCallPart.providerOptions).toEqual({
        google: {
          thoughtSignature: 'sig_abc123_test_signature',
        },
      });
    });

    it('should not add providerOptions when providerMetadata is undefined', async () => {
      const mockWritable = createMockWritable();
      const mockModel = vi.fn();

      let capturedPrompt: LanguageModelV4Prompt | undefined;

      const toolCallWithoutMetadata: LanguageModelV4ToolCall = {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'testTool',
        input: '{"query":"test"}',
        // No providerMetadata
      };

      vi.mocked(doStreamStep)
        .mockResolvedValueOnce(
          createMockDoStreamStepResult({
            toolCalls: [toolCallWithoutMetadata],
            finishReason: 'tool-calls',
            finishRaw: 'tool_calls',
          }),
        )
        .mockImplementationOnce(
          async (prompt, _modelInit, _writable, _tools, _options) => {
            capturedPrompt = prompt;
            return createMockDoStreamStepResult();
          },
        );

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          testTool: {
            description: 'A test tool',
            execute: async () => ({ result: 'success' }),
          },
        } as unknown as ToolSet,
        writable: mockWritable,
        model: mockModel as any,
      });

      const firstResult = await iterator.next();
      expect(firstResult.done).toBe(false);

      const toolResults: LanguageModelV4ToolResultPart[] = [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'testTool',
          output: { type: 'text', value: '{"result":"success"}' },
        },
      ];

      await iterator.next(toolResults);

      const assistantMessage = capturedPrompt?.find(
        msg => msg.role === 'assistant',
      );
      const toolCallPart = (assistantMessage?.content as any[])?.find(
        part => part.type === 'tool-call',
      );

      expect(toolCallPart).toBeDefined();
      expect(toolCallPart.providerOptions).toBeUndefined();
    });

    it('should preserve providerMetadata for multiple parallel tool calls', async () => {
      const mockWritable = createMockWritable();
      const mockModel = vi.fn();

      let capturedPrompt: LanguageModelV4Prompt | undefined;

      const toolCalls: LanguageModelV4ToolCall[] = [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weatherTool',
          input: '{"city":"NYC"}',
          providerMetadata: {
            google: { thoughtSignature: 'sig_weather_123' },
          },
        },
        {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'newsTool',
          input: '{"topic":"tech"}',
          providerMetadata: {
            google: { thoughtSignature: 'sig_news_456' },
          },
        },
      ];

      vi.mocked(doStreamStep)
        .mockResolvedValueOnce(
          createMockDoStreamStepResult({
            toolCalls,
            finishReason: 'tool-calls',
            finishRaw: 'tool_calls',
          }),
        )
        .mockImplementationOnce(
          async (prompt, _modelInit, _writable, _tools, _options) => {
            capturedPrompt = prompt;
            return createMockDoStreamStepResult();
          },
        );

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          weatherTool: {
            description: 'Weather tool',
            execute: async () => ({ temp: 72 }),
          },
          newsTool: {
            description: 'News tool',
            execute: async () => ({ headlines: [] }),
          },
        } as unknown as ToolSet,
        writable: mockWritable,
        model: mockModel as any,
      });

      const firstResult = await iterator.next();
      expect(firstResult.done).toBe(false);
      const firstValue = firstResult.value as StreamTextIteratorYieldValue;
      expect(firstValue.toolCalls).toHaveLength(2);

      const toolResults: LanguageModelV4ToolResultPart[] = [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'weatherTool',
          output: { type: 'text', value: '{"temp":72}' },
        },
        {
          type: 'tool-result',
          toolCallId: 'call-2',
          toolName: 'newsTool',
          output: { type: 'text', value: '{"headlines":[]}' },
        },
      ];

      await iterator.next(toolResults);

      const assistantMessage = capturedPrompt?.find(
        msg => msg.role === 'assistant',
      );
      const toolCallParts = (assistantMessage?.content as any[])?.filter(
        part => part.type === 'tool-call',
      );

      expect(toolCallParts).toHaveLength(2);

      // Verify each tool call has its own providerOptions
      const weatherToolCall = toolCallParts?.find(
        part => part.toolName === 'weatherTool',
      );
      expect(weatherToolCall?.providerOptions).toEqual({
        google: { thoughtSignature: 'sig_weather_123' },
      });

      const newsToolCall = toolCallParts?.find(
        part => part.toolName === 'newsTool',
      );
      expect(newsToolCall?.providerOptions).toEqual({
        google: { thoughtSignature: 'sig_news_456' },
      });
    });

    it('should handle mixed tool calls with and without providerMetadata', async () => {
      const mockWritable = createMockWritable();
      const mockModel = vi.fn();

      let capturedPrompt: LanguageModelV4Prompt | undefined;

      const toolCalls: LanguageModelV4ToolCall[] = [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'toolWithMeta',
          input: '{}',
          providerMetadata: {
            vertex: { thoughtSignature: 'sig_vertex_789' },
          },
        },
        {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'toolWithoutMeta',
          input: '{}',
          // No providerMetadata
        },
      ];

      vi.mocked(doStreamStep)
        .mockResolvedValueOnce(
          createMockDoStreamStepResult({
            toolCalls,
            finishReason: 'tool-calls',
            finishRaw: 'tool_calls',
          }),
        )
        .mockImplementationOnce(
          async (prompt, _modelInit, _writable, _tools, _options) => {
            capturedPrompt = prompt;
            return createMockDoStreamStepResult();
          },
        );

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          toolWithMeta: {
            description: 'Tool with metadata',
            execute: async () => ({ ok: true }),
          },
          toolWithoutMeta: {
            description: 'Tool without metadata',
            execute: async () => ({ ok: true }),
          },
        } as unknown as ToolSet,
        writable: mockWritable,
        model: mockModel as any,
      });

      await iterator.next();

      const toolResults: LanguageModelV4ToolResultPart[] = [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'toolWithMeta',
          output: { type: 'text', value: '{"ok":true}' },
        },
        {
          type: 'tool-result',
          toolCallId: 'call-2',
          toolName: 'toolWithoutMeta',
          output: { type: 'text', value: '{"ok":true}' },
        },
      ];

      await iterator.next(toolResults);

      const assistantMessage = capturedPrompt?.find(
        msg => msg.role === 'assistant',
      );
      const toolCallParts = (assistantMessage?.content as any[])?.filter(
        part => part.type === 'tool-call',
      );

      const toolWithMeta = toolCallParts?.find(
        part => part.toolName === 'toolWithMeta',
      );
      expect(toolWithMeta?.providerOptions).toEqual({
        vertex: { thoughtSignature: 'sig_vertex_789' },
      });

      const toolWithoutMeta = toolCallParts?.find(
        part => part.toolName === 'toolWithoutMeta',
      );
      expect(toolWithoutMeta?.providerOptions).toBeUndefined();
    });

    it('should strip OpenAI itemId from providerMetadata to avoid reasoning item errors', async () => {
      const mockWritable = createMockWritable();
      const mockModel = vi.fn();

      let capturedPrompt: LanguageModelV4Prompt | undefined;

      // OpenAI Responses API returns itemId which requires reasoning items we don't preserve
      const toolCallWithOpenAIMetadata: LanguageModelV4ToolCall = {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'testTool',
        input: '{"query":"test"}',
        providerMetadata: {
          openai: {
            itemId: 'fc_0402bf2d292dd7ed00697a35fb10e0819ab0098545c4d0d7f5',
          },
        },
      };

      vi.mocked(doStreamStep)
        .mockResolvedValueOnce(
          createMockDoStreamStepResult({
            toolCalls: [toolCallWithOpenAIMetadata],
            finishReason: 'tool-calls',
            finishRaw: 'tool_calls',
          }),
        )
        .mockImplementationOnce(
          async (prompt, _modelInit, _writable, _tools, _options) => {
            capturedPrompt = prompt;
            return createMockDoStreamStepResult();
          },
        );

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          testTool: {
            description: 'A test tool',
            execute: async () => ({ result: 'success' }),
          },
        } as unknown as ToolSet,
        writable: mockWritable,
        model: mockModel as any,
      });

      await iterator.next();

      const toolResults: LanguageModelV4ToolResultPart[] = [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'testTool',
          output: { type: 'text', value: '{"result":"success"}' },
        },
      ];

      await iterator.next(toolResults);

      const assistantMessage = capturedPrompt?.find(
        msg => msg.role === 'assistant',
      );
      const toolCallPart = (assistantMessage?.content as any[])?.find(
        part => part.type === 'tool-call',
      );

      // itemId should be stripped, leaving no providerOptions
      expect(toolCallPart).toBeDefined();
      expect(toolCallPart.providerOptions).toBeUndefined();
    });

    it('should preserve other OpenAI metadata while stripping itemId', async () => {
      const mockWritable = createMockWritable();
      const mockModel = vi.fn();

      let capturedPrompt: LanguageModelV4Prompt | undefined;

      // OpenAI metadata with both itemId (should be stripped) and other fields (should be preserved)
      const toolCallWithMixedOpenAIMetadata: LanguageModelV4ToolCall = {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'testTool',
        input: '{"query":"test"}',
        providerMetadata: {
          openai: {
            itemId: 'fc_0402bf2d292dd7ed00697a35fb10e0819ab0098545c4d0d7f5',
            someOtherField: 'should-be-preserved',
          },
        },
      };

      vi.mocked(doStreamStep)
        .mockResolvedValueOnce(
          createMockDoStreamStepResult({
            toolCalls: [toolCallWithMixedOpenAIMetadata],
            finishReason: 'tool-calls',
            finishRaw: 'tool_calls',
          }),
        )
        .mockImplementationOnce(
          async (prompt, _modelInit, _writable, _tools, _options) => {
            capturedPrompt = prompt;
            return createMockDoStreamStepResult();
          },
        );

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          testTool: {
            description: 'A test tool',
            execute: async () => ({ result: 'success' }),
          },
        } as unknown as ToolSet,
        writable: mockWritable,
        model: mockModel as any,
      });

      await iterator.next();

      const toolResults: LanguageModelV4ToolResultPart[] = [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'testTool',
          output: { type: 'text', value: '{"result":"success"}' },
        },
      ];

      await iterator.next(toolResults);

      const assistantMessage = capturedPrompt?.find(
        msg => msg.role === 'assistant',
      );
      const toolCallPart = (assistantMessage?.content as any[])?.find(
        part => part.type === 'tool-call',
      );

      // itemId should be stripped, but other fields preserved
      expect(toolCallPart).toBeDefined();
      expect(toolCallPart.providerOptions).toEqual({
        openai: {
          someOtherField: 'should-be-preserved',
        },
      });
    });

    it('should preserve Gemini metadata while stripping OpenAI itemId in mixed provider metadata', async () => {
      const mockWritable = createMockWritable();
      const mockModel = vi.fn();

      let capturedPrompt: LanguageModelV4Prompt | undefined;

      // Mixed provider metadata - Gemini should be fully preserved, OpenAI itemId stripped
      const toolCallWithMixedProviders: LanguageModelV4ToolCall = {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'testTool',
        input: '{"query":"test"}',
        providerMetadata: {
          google: {
            thoughtSignature: 'sig_gemini_preserved',
          },
          openai: {
            itemId: 'fc_should_be_stripped',
          },
        },
      };

      vi.mocked(doStreamStep)
        .mockResolvedValueOnce(
          createMockDoStreamStepResult({
            toolCalls: [toolCallWithMixedProviders],
            finishReason: 'tool-calls',
            finishRaw: 'tool_calls',
          }),
        )
        .mockImplementationOnce(
          async (prompt, _modelInit, _writable, _tools, _options) => {
            capturedPrompt = prompt;
            return createMockDoStreamStepResult();
          },
        );

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {
          testTool: {
            description: 'A test tool',
            execute: async () => ({ result: 'success' }),
          },
        } as unknown as ToolSet,
        writable: mockWritable,
        model: mockModel as any,
      });

      await iterator.next();

      const toolResults: LanguageModelV4ToolResultPart[] = [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'testTool',
          output: { type: 'text', value: '{"result":"success"}' },
        },
      ];

      await iterator.next(toolResults);

      const assistantMessage = capturedPrompt?.find(
        msg => msg.role === 'assistant',
      );
      const toolCallPart = (assistantMessage?.content as any[])?.find(
        part => part.type === 'tool-call',
      );

      // Gemini metadata should be preserved, OpenAI itemId stripped
      expect(toolCallPart).toBeDefined();
      expect(toolCallPart.providerOptions).toEqual({
        google: {
          thoughtSignature: 'sig_gemini_preserved',
        },
      });
    });
  });

  describe('runtimeContext and toolsContext', () => {
    it('applies current contexts to the reconstructed step and yield value', async () => {
      const runtimeContext = { tenantId: 'tenant_123' };
      const toolsContext = { weather: { unit: 'celsius' } };

      vi.mocked(doStreamStep).mockResolvedValueOnce(
        createMockDoStreamStepResult({ finishReason: 'stop' }),
      );

      const iterator = streamTextIterator({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
        tools: {} as ToolSet,
        writable: createMockWritable(),
        model: vi.fn() as any,
        runtimeContext,
        toolsContext,
      });

      const result = await iterator.next();
      const yielded = result.value as StreamTextIteratorYieldValue;

      // Contexts are no longer serialized across the step boundary; the
      // iterator applies them when it reconstructs the StepResult outside.
      expect(doStreamStep).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Function),
        expect.any(WritableStream),
        expect.any(Object),
        expect.not.objectContaining({ runtimeContext }),
      );
      expect(yielded).toMatchObject({
        runtimeContext,
        toolsContext,
      });
      expect(yielded.step).toMatchObject({
        stepNumber: 0,
        runtimeContext,
        toolsContext,
      });
    });
  });
});
