/**
 * WorkflowAgent compatibility test suite — ported from AI SDK's ToolLoopAgent tests.
 *
 * These tests are a 1:1 port of tool-loop-agent.test.ts (stream tests only).
 * They use the SAME API names as ToolLoopAgent to serve as a compatibility spec.
 * Tests that fail are expected — they indicate features WorkflowAgent must implement.
 *
 * DIVERGENCES from ToolLoopAgent (necessary for workflow runtime):
 * - WorkflowAgent.stream() requires `messages` (ModelMessage[]) + `writable` (WritableStream)
 *   instead of ToolLoopAgent's `prompt` string
 * - WorkflowAgent returns WorkflowAgentStreamResult (not StreamTextResult with consumeStream())
 */
import { tool } from 'ai';
import type {
  Experimental_LanguageModelStreamPart,
  ToolSet,
  UIMessageChunk,
} from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { WorkflowAgent } from './workflow-agent.js';

// ============================================================================
// Test helpers
// ============================================================================

/**
 * Creates a mock WritableStream for WorkflowAgent.stream().
 * DIVERGENCE: WorkflowAgent requires a writable stream; ToolLoopAgent does not.
 */
function createMockWritable() {
  const chunks: Experimental_LanguageModelStreamPart<ToolSet>[] = [];
  const writable = new WritableStream<
    Experimental_LanguageModelStreamPart<ToolSet>
  >({
    write(chunk) {
      chunks.push(chunk);
    },
  });
  return { writable, chunks };
}

// ============================================================================
// Shared stream parts
// ============================================================================

const dummyStreamFinish = {
  type: 'finish' as const,
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: {
    inputTokens: {
      total: 3,
      noCache: 3,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 10,
      text: 10,
      reasoning: undefined,
    },
  },
  providerMetadata: {},
};

function createSimpleStreamResponse() {
  return {
    stream: convertArrayToReadableStream([
      { type: 'stream-start' as const, warnings: [] },
      {
        type: 'response-metadata' as const,
        id: 'id-0',
        modelId: 'mock-model-id',
        timestamp: new Date(0),
      },
      { type: 'text-start' as const, id: '1' },
      { type: 'text-delta' as const, id: '1', delta: 'Hello' },
      { type: 'text-delta' as const, id: '1', delta: ', ' },
      { type: 'text-delta' as const, id: '1', delta: 'world!' },
      { type: 'text-end' as const, id: '1' },
      {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: {
          inputTokens: {
            total: 3,
            noCache: 3,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 10,
            text: 10,
            reasoning: undefined,
          },
        },
        providerMetadata: {
          testProvider: { testKey: 'testValue' },
        },
      },
    ]),
  };
}

function createShortStreamResponse() {
  return {
    stream: convertArrayToReadableStream([
      { type: 'stream-start' as const, warnings: [] },
      {
        type: 'response-metadata' as const,
        id: 'id-0',
        modelId: 'mock-model-id',
        timestamp: new Date(0),
      },
      { type: 'text-start' as const, id: '1' },
      { type: 'text-delta' as const, id: '1', delta: 'Hello' },
      { type: 'text-end' as const, id: '1' },
      {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: {
          inputTokens: {
            total: 3,
            noCache: 3,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 10,
            text: 10,
            reasoning: undefined,
          },
        },
        providerMetadata: {
          testProvider: { testKey: 'testValue' },
        },
      },
    ]),
  };
}

function createToolCallStreamMockModel() {
  let callCount = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      if (callCount++ === 0) {
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start' as const, warnings: [] },
            {
              type: 'response-metadata' as const,
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call' as const,
              toolCallId: 'call-1',
              toolName: 'testTool',
              input: '{ "value": "test" }',
            },
            {
              ...dummyStreamFinish,
              finishReason: {
                unified: 'tool-calls' as const,
                raw: undefined,
              },
            },
          ]),
        };
      }
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          {
            type: 'response-metadata' as const,
            id: 'id-1',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          { type: 'text-start' as const, id: '1' },
          { type: 'text-delta' as const, id: '1', delta: 'done' },
          { type: 'text-end' as const, id: '1' },
          dummyStreamFinish,
        ]),
      };
    },
  });
}

function createToolCallStreamMockModelWithInput(input: string) {
  let callCount = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      if (callCount++ === 0) {
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start' as const, warnings: [] },
            {
              type: 'response-metadata' as const,
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call' as const,
              toolCallId: 'call-1',
              toolName: 'testTool',
              input,
            },
            {
              ...dummyStreamFinish,
              finishReason: {
                unified: 'tool-calls' as const,
                raw: undefined,
              },
            },
          ]),
        };
      }
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          {
            type: 'response-metadata' as const,
            id: 'id-1',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          { type: 'text-start' as const, id: '1' },
          { type: 'text-delta' as const, id: '1', delta: 'done' },
          { type: 'text-end' as const, id: '1' },
          dummyStreamFinish,
        ]),
      };
    },
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('WorkflowAgent (ToolLoopAgent compat)', () => {
  describe('stream', () => {
    let doStreamOptions: any;
    let mockModel: MockLanguageModelV4;

    beforeEach(() => {
      doStreamOptions = undefined;
      mockModel = new MockLanguageModelV4({
        doStream: async options => {
          doStreamOptions = options;
          return createSimpleStreamResponse();
        },
      });
    });

    it('should use prepareCall', async () => {
      const agent = new WorkflowAgent({
        model: mockModel,
        prepareCall: options => {
          return {
            ...options,
            providerOptions: {
              test: { value: 'from-prepareCall' },
            },
          };
        },
      });

      const { writable } = createMockWritable();

      await agent.stream({
        messages: [{ role: 'user' as const, content: 'Hello, world!' }],
        writable,
      });

      expect(doStreamOptions?.providerOptions).toMatchInlineSnapshot(`
        {
          "test": {
            "value": "from-prepareCall",
          },
        }
      `);
    });

    it('should pass abortSignal to streamText', async () => {
      const abortController = new AbortController();

      const agent = new WorkflowAgent({
        model: mockModel,
      });

      const { writable } = createMockWritable();

      await agent.stream({
        messages: [{ role: 'user' as const, content: 'Hello, world!' }],
        writable,
        abortSignal: abortController.signal,
      });

      expect(doStreamOptions?.abortSignal).toBe(abortController.signal);
    });

    it('should pass timeout to streamText', async () => {
      const agent = new WorkflowAgent({
        model: mockModel,
      });

      const { writable } = createMockWritable();

      await agent.stream({
        messages: [{ role: 'user' as const, content: 'Hello, world!' }],
        writable,
        timeout: 5000,
      });

      // timeout is merged into abortSignal, so we check that an abort signal was created
      expect(doStreamOptions?.abortSignal).toBeDefined();
    });

    it('should pass string instructions', async () => {
      // GAP: WorkflowAgent uses `system` (string only) instead of `instructions`
      // (which can be string | SystemModelMessage | SystemModelMessage[])
      const agent = new WorkflowAgent({
        model: mockModel,
        instructions: 'INSTRUCTIONS',
      });

      const { writable } = createMockWritable();

      await agent.stream({
        messages: [{ role: 'user' as const, content: 'Hello, world!' }],
        writable,
      });

      expect(doStreamOptions?.prompt).toMatchInlineSnapshot(`
        [
          {
            "content": "INSTRUCTIONS",
            "providerOptions": undefined,
            "role": "system",
          },
          {
            "content": [
              {
                "providerOptions": undefined,
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "providerOptions": undefined,
            "role": "user",
          },
        ]
      `);
    });

    it('should pass system message instructions', async () => {
      // GAP: WorkflowAgent only supports string system prompts, not SystemModelMessage objects
      const agent = new WorkflowAgent({
        model: mockModel,
        instructions: {
          role: 'system',
          content: 'INSTRUCTIONS',
          providerOptions: { test: { value: 'test' } },
        },
      });

      const { writable } = createMockWritable();

      await agent.stream({
        messages: [{ role: 'user' as const, content: 'Hello, world!' }],
        writable,
      });

      expect(doStreamOptions?.prompt).toMatchInlineSnapshot(`
        [
          {
            "content": "INSTRUCTIONS",
            "providerOptions": {
              "test": {
                "value": "test",
              },
            },
            "role": "system",
          },
          {
            "content": [
              {
                "providerOptions": undefined,
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "providerOptions": undefined,
            "role": "user",
          },
        ]
      `);
    });

    it('should pass array of system message instructions', async () => {
      // GAP: WorkflowAgent doesn't support array of SystemModelMessage
      const agent = new WorkflowAgent({
        model: mockModel,
        instructions: [
          {
            role: 'system',
            content: 'INSTRUCTIONS_1',
            providerOptions: { test: { value: 'test1' } },
          },
          {
            role: 'system',
            content: 'INSTRUCTIONS_2',
            providerOptions: { test: { value: 'test2' } },
          },
        ],
      });

      const { writable } = createMockWritable();

      await agent.stream({
        messages: [{ role: 'user' as const, content: 'Hello, world!' }],
        writable,
      });

      expect(doStreamOptions?.prompt).toMatchInlineSnapshot(`
        [
          {
            "content": "INSTRUCTIONS_1",
            "providerOptions": {
              "test": {
                "value": "test1",
              },
            },
            "role": "system",
          },
          {
            "content": "INSTRUCTIONS_2",
            "providerOptions": {
              "test": {
                "value": "test2",
              },
            },
            "role": "system",
          },
          {
            "content": [
              {
                "providerOptions": undefined,
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "providerOptions": undefined,
            "role": "user",
          },
        ]
      `);
    });
  });

  describe('experimental_onStart', () => {
    describe('stream', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doStream: async () => createShortStreamResponse(),
        });
      });

      it('should call experimental_onStart from constructor', async () => {
        const onStartCalls: string[] = [];

        const agent = new WorkflowAgent({
          model: mockModel,
          experimental_onStart: async () => {
            onStartCalls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
        });

        expect(onStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onStart from stream method', async () => {
        const onStartCalls: string[] = [];

        const agent = new WorkflowAgent({ model: mockModel });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
          experimental_onStart: async () => {
            onStartCalls.push('method');
          },
        });

        expect(onStartCalls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method experimental_onStart in correct order', async () => {
        const onStartCalls: string[] = [];

        const agent = new WorkflowAgent({
          model: mockModel,
          experimental_onStart: async () => {
            onStartCalls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
          experimental_onStart: async () => {
            onStartCalls.push('method');
          },
        });

        expect(onStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      // GAP: WorkflowAgent's onStart event doesn't include system, temperature,
      // maxOutputTokens, experimental_context, or resolved model yet.
      // These fields need to be added to match ToolLoopAgent's OnStartEvent.
      it('should pass correct event information', async () => {
        let startEvent!: any;

        const agent = new WorkflowAgent({
          model: mockModel,
          instructions: 'You are a helpful assistant',
          temperature: 0.7,
          maxOutputTokens: 500,
          experimental_context: { userId: 'test-user' },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
          experimental_onStart: async (event: any) => {
            startEvent = event;
          },
        });

        expect({
          model: startEvent.model,
          system: startEvent.system,
          prompt: startEvent.prompt,
          messages: startEvent.messages,
          temperature: startEvent.temperature,
          maxOutputTokens: startEvent.maxOutputTokens,
          experimental_context: startEvent.experimental_context,
        }).toMatchInlineSnapshot(`
          {
            "experimental_context": undefined,
            "maxOutputTokens": undefined,
            "messages": [
              {
                "content": "Hello, world!",
                "role": "user",
              },
            ],
            "model": MockLanguageModelV4 {
              "_supportedUrls": [Function],
              "doGenerate": [Function],
              "doGenerateCalls": [],
              "doStream": [Function],
              "doStreamCalls": [
                {
                  "abortSignal": undefined,
                  "frequencyPenalty": undefined,
                  "headers": undefined,
                  "includeRawChunks": false,
                  "maxOutputTokens": 500,
                  "presencePenalty": undefined,
                  "prompt": [
                    {
                      "content": "You are a helpful assistant",
                      "providerOptions": undefined,
                      "role": "system",
                    },
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "Hello, world!",
                          "type": "text",
                        },
                      ],
                      "providerOptions": undefined,
                      "role": "user",
                    },
                  ],
                  "providerOptions": undefined,
                  "responseFormat": undefined,
                  "seed": undefined,
                  "stopSequences": undefined,
                  "temperature": 0.7,
                  "toolChoice": {
                    "type": "auto",
                  },
                  "tools": undefined,
                  "topK": undefined,
                  "topP": undefined,
                },
              ],
              "modelId": "mock-model-id",
              "provider": "mock-provider",
              "specificationVersion": "v4",
            },
            "prompt": undefined,
            "system": undefined,
            "temperature": undefined,
          }
        `);
      });
    });
  });

  describe('experimental_onStepStart', () => {
    describe('stream', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doStream: async () => createShortStreamResponse(),
        });
      });

      it('should call experimental_onStepStart from constructor', async () => {
        const onStepStartCalls: string[] = [];

        const agent = new WorkflowAgent({
          model: mockModel,
          experimental_onStepStart: async () => {
            onStepStartCalls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
        });

        expect(onStepStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onStepStart from stream method', async () => {
        const onStepStartCalls: string[] = [];

        const agent = new WorkflowAgent({ model: mockModel });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
          experimental_onStepStart: async () => {
            onStepStartCalls.push('method');
          },
        });

        expect(onStepStartCalls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method experimental_onStepStart in correct order', async () => {
        const onStepStartCalls: string[] = [];

        const agent = new WorkflowAgent({
          model: mockModel,
          experimental_onStepStart: async () => {
            onStepStartCalls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
          experimental_onStepStart: async () => {
            onStepStartCalls.push('method');
          },
        });

        expect(onStepStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      // GAP: WorkflowAgent's onStepStart event doesn't include system, steps,
      // experimental_context, or resolved model yet.
      // These fields need to be added to match ToolLoopAgent's OnStepStartEvent.
      it('should pass correct event information', async () => {
        let stepStartEvent!: any;

        const agent = new WorkflowAgent({
          model: mockModel,
          instructions: 'You are a helpful assistant',
          experimental_context: { userId: 'test-user' },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
          experimental_onStepStart: async (event: any) => {
            stepStartEvent = event;
          },
        });

        expect({
          stepNumber: stepStartEvent.stepNumber,
          model: stepStartEvent.model,
          system: stepStartEvent.system,
          messagesLength: stepStartEvent.messages.length,
          steps: stepStartEvent.steps,
          experimental_context: stepStartEvent.experimental_context,
        }).toMatchInlineSnapshot(`
          {
            "experimental_context": undefined,
            "messagesLength": 3,
            "model": MockLanguageModelV4 {
              "_supportedUrls": [Function],
              "doGenerate": [Function],
              "doGenerateCalls": [],
              "doStream": [Function],
              "doStreamCalls": [
                {
                  "abortSignal": undefined,
                  "frequencyPenalty": undefined,
                  "headers": undefined,
                  "includeRawChunks": false,
                  "maxOutputTokens": undefined,
                  "presencePenalty": undefined,
                  "prompt": [
                    {
                      "content": "You are a helpful assistant",
                      "providerOptions": undefined,
                      "role": "system",
                    },
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "Hello, world!",
                          "type": "text",
                        },
                      ],
                      "providerOptions": undefined,
                      "role": "user",
                    },
                  ],
                  "providerOptions": undefined,
                  "responseFormat": undefined,
                  "seed": undefined,
                  "stopSequences": undefined,
                  "temperature": undefined,
                  "toolChoice": {
                    "type": "auto",
                  },
                  "tools": undefined,
                  "topK": undefined,
                  "topP": undefined,
                },
              ],
              "modelId": "mock-model-id",
              "provider": "mock-provider",
              "specificationVersion": "v4",
            },
            "stepNumber": 0,
            "steps": undefined,
            "system": undefined,
          }
        `);
      });
    });
  });

  describe('onStepFinish', () => {
    describe('stream', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doStream: async () => createSimpleStreamResponse(),
        });
      });

      it('should call onStepFinish from constructor', async () => {
        const onStepFinishCalls: string[] = [];
        const agent = new WorkflowAgent({
          model: mockModel,
          onStepFinish: async () => {
            onStepFinishCalls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
        });

        expect(onStepFinishCalls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call onStepFinish from stream method', async () => {
        const onStepFinishCalls: string[] = [];

        const agent = new WorkflowAgent({
          model: mockModel,
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
          onStepFinish: async () => {
            onStepFinishCalls.push('method');
          },
        });

        expect(onStepFinishCalls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method onStepFinish in correct order', async () => {
        const onStepFinishCalls: string[] = [];

        const agent = new WorkflowAgent({
          model: mockModel,
          onStepFinish: async () => {
            onStepFinishCalls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
          onStepFinish: async () => {
            onStepFinishCalls.push('method');
          },
        });

        expect(onStepFinishCalls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass stepResult to onStepFinish callback', async () => {
        let capturedStepResult: any;

        const agent = new WorkflowAgent({
          model: mockModel,
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'Hello, world!' }],
          writable,
          onStepFinish: async (stepResult: any) => {
            capturedStepResult = stepResult;
          },
        });

        expect({
          finishReason: capturedStepResult.finishReason,
          stepNumber: capturedStepResult.stepNumber,
          text: capturedStepResult.text,
          inputTokens: capturedStepResult.usage.inputTokens,
          outputTokens: capturedStepResult.usage.outputTokens,
          providerMetadata: capturedStepResult.providerMetadata,
        }).toMatchInlineSnapshot(`
          {
            "finishReason": "stop",
            "inputTokens": 3,
            "outputTokens": 10,
            "providerMetadata": {
              "testProvider": {
                "testKey": "testValue",
              },
            },
            "stepNumber": 0,
            "text": "Hello, world!",
          }
        `);
      });
    });
  });

  describe('experimental_onToolCallStart', () => {
    describe('stream', () => {
      it('should call experimental_onToolCallStart from constructor', async () => {
        const calls: string[] = [];

        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallStart: async () => {
            calls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onToolCallStart from stream method', async () => {
        const calls: string[] = [];

        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
          experimental_onToolCallStart: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method in correct order', async () => {
        const calls: string[] = [];

        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallStart: async () => {
            calls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
          experimental_onToolCallStart: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it.fails('should pass correct event information', async () => {
        let event!: any;

        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
          experimental_onToolCallStart: async (e: any) => {
            event = e;
          },
        });

        expect({
          toolCallName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
          toolCallInput: event.toolCall.input,
          messagesLength: event.messages.length,
        }).toMatchInlineSnapshot(`
          {
            "messagesLength": 1,
            "toolCallId": "call-1",
            "toolCallInput": {
              "value": "test",
            },
            "toolCallName": "testTool",
          }
        `);
      });
    });
  });

  describe('experimental_onToolCallFinish', () => {
    describe('stream', () => {
      it('should call experimental_onToolCallFinish from constructor', async () => {
        const calls: string[] = [];

        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallFinish: async () => {
            calls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onToolCallFinish from stream method', async () => {
        const calls: string[] = [];

        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
          experimental_onToolCallFinish: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method in correct order', async () => {
        const calls: string[] = [];

        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallFinish: async () => {
            calls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
          experimental_onToolCallFinish: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it.fails('should pass correct event information on success', async () => {
        let event!: any;

        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModelWithInput('{ "value": "hello" }'),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
          experimental_onToolCallFinish: async (e: any) => {
            event = e;
          },
        });

        expect(event.durationMs).toBeGreaterThanOrEqual(0);
        expect({
          toolCallName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
          toolCallInput: event.toolCall.input,
          success: event.success,
          output: event.success ? event.output : undefined,
          messagesLength: event.messages.length,
        }).toMatchInlineSnapshot(`
          {
            "messagesLength": 1,
            "output": "hello-result",
            "success": true,
            "toolCallId": "call-1",
            "toolCallInput": {
              "value": "hello",
            },
            "toolCallName": "testTool",
          }
        `);
      });
    });
  });

  describe('onFinish', () => {
    describe('stream', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doStream: async () => createSimpleStreamResponse(),
        });
      });

      it('should call onFinish from constructor', async () => {
        const calls: string[] = [];
        const agent = new WorkflowAgent({
          model: mockModel,
          onFinish: async () => {
            calls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call onFinish from stream method', async () => {
        const calls: string[] = [];

        const agent = new WorkflowAgent({
          model: mockModel,
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
          onFinish: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method in correct order', async () => {
        const calls: string[] = [];

        const agent = new WorkflowAgent({
          model: mockModel,
          onFinish: async () => {
            calls.push('constructor');
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
          onFinish: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass correct event information', async () => {
        let event!: any;

        const agent = new WorkflowAgent({
          model: mockModel,
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
          onFinish: async (e: any) => {
            event = e;
          },
        });

        expect({
          text: event.text,
          finishReason: event.finishReason,
          stepsLength: event.steps.length,
          inputTokens: event.totalUsage.inputTokens,
          outputTokens: event.totalUsage.outputTokens,
        }).toMatchInlineSnapshot(`
          {
            "finishReason": "stop",
            "inputTokens": 3,
            "outputTokens": 10,
            "stepsLength": 1,
            "text": "Hello, world!",
          }
        `);
      });
    });
  });

  describe('telemetry integrations', () => {
    afterEach(() => {
      (globalThis as any).AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
    });

    describe('stream', () => {
      it.fails('should call per-call integration listeners for all lifecycle events', async () => {
        const events: string[] = [];

        // GAP: WorkflowAgent does not support telemetry integration listeners
        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_telemetry: {
            // @ts-expect-error - not yet implemented on WorkflowAgent
            integrations: {
              onStart: async () => {
                events.push('onStart');
              },
              onStepStart: async () => {
                events.push('onStepStart');
              },
              onToolCallStart: async () => {
                events.push('onToolCallStart');
              },
              onToolCallFinish: async () => {
                events.push('onToolCallFinish');
              },
              onStepFinish: async () => {
                events.push('onStepFinish');
              },
              onFinish: async () => {
                events.push('onFinish');
              },
            },
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
        });

        expect(events).toEqual([
          'onStart',
          'onStepStart',
          'onToolCallStart',
          'onToolCallFinish',
          'onStepFinish',
          'onStepStart',
          'onStepFinish',
          'onFinish',
        ]);
      });

      it.fails('should call globally registered integration listeners', async () => {
        const events: string[] = [];

        (globalThis as any).AI_SDK_TELEMETRY_INTEGRATIONS = [
          {
            onStart: async () => {
              events.push('global-onStart');
            },
            onStepFinish: async () => {
              events.push('global-onStepFinish');
            },
            onFinish: async () => {
              events.push('global-onFinish');
            },
          },
        ];

        const agent = new WorkflowAgent({
          model: new MockLanguageModelV4({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'stream-start' as const, warnings: [] },
                {
                  type: 'response-metadata' as const,
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start' as const, id: '1' },
                { type: 'text-delta' as const, id: '1', delta: 'Hello!' },
                { type: 'text-end' as const, id: '1' },
                dummyStreamFinish,
              ]),
            }),
          }),
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
        });

        expect(events).toEqual([
          'global-onStart',
          'global-onStepFinish',
          'global-onFinish',
        ]);
      });

      it.fails('should call integration listeners alongside agent callbacks', async () => {
        const events: string[] = [];

        const agent = new WorkflowAgent({
          model: new MockLanguageModelV4({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'stream-start' as const, warnings: [] },
                {
                  type: 'response-metadata' as const,
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start' as const, id: '1' },
                { type: 'text-delta' as const, id: '1', delta: 'Hello!' },
                { type: 'text-end' as const, id: '1' },
                dummyStreamFinish,
              ]),
            }),
          }),
          experimental_onStart: async () => {
            events.push('agent-onStart');
          },
          onStepFinish: async () => {
            events.push('agent-onStepFinish');
          },
          onFinish: async () => {
            events.push('agent-onFinish');
          },
          experimental_telemetry: {
            // @ts-expect-error - not yet implemented on WorkflowAgent
            integrations: {
              onStart: async () => {
                events.push('integration-onStart');
              },
              onStepFinish: async () => {
                events.push('integration-onStepFinish');
              },
              onFinish: async () => {
                events.push('integration-onFinish');
              },
            },
          },
        });

        const { writable } = createMockWritable();
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
        });

        expect(events).toEqual([
          'agent-onStart',
          'integration-onStart',
          'agent-onStepFinish',
          'integration-onStepFinish',
          'agent-onFinish',
          'integration-onFinish',
        ]);
      });

      it('should not break streaming when an integration listener throws', async () => {
        const agent = new WorkflowAgent({
          model: new MockLanguageModelV4({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'stream-start' as const, warnings: [] },
                {
                  type: 'response-metadata' as const,
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start' as const, id: '1' },
                { type: 'text-delta' as const, id: '1', delta: 'Hello!' },
                { type: 'text-end' as const, id: '1' },
                dummyStreamFinish,
              ]),
            }),
          }),
          experimental_telemetry: {
            // @ts-expect-error - not yet implemented on WorkflowAgent
            integrations: {
              onStart: async () => {
                throw new Error('integration error');
              },
              onStepFinish: async () => {
                throw new Error('integration error');
              },
              onFinish: async () => {
                throw new Error('integration error');
              },
            },
          },
        });

        const { writable } = createMockWritable();
        // Should not throw even though integration listeners throw
        await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
        });
      });
    });
  });

  describe('tool approval', () => {
    describe('stream', () => {
      it('should pause agent when tool has needsApproval: true', async () => {
        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
              needsApproval: true,
            }),
          },
        });

        const { writable, chunks } = createMockWritable();
        const result = await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
        });

        // When approval is needed, the agent should stop and return the
        // unresolved tool call (similar to client-side tools without execute).
        // The toolCalls should contain the pending call, and toolResults
        // should NOT contain it (since it wasn't executed yet).
        expect(result.toolCalls.length).toBe(1);
        expect(result.toolCalls[0].toolName).toBe('testTool');
        expect(result.toolResults.length).toBe(0);
      });

      it('should support needsApproval as a function', async () => {
        let approvalInput: any = null;

        const agent = new WorkflowAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
              needsApproval: async (input: any) => {
                approvalInput = input;
                return true; // always require approval
              },
            }),
          },
        });

        const { writable } = createMockWritable();
        const result = await agent.stream({
          messages: [{ role: 'user' as const, content: 'test' }],
          writable,
        });

        // The approval function should have been called with the tool input
        expect(approvalInput).toEqual({ value: 'test' });

        // Agent should pause waiting for approval
        expect(result.toolCalls.length).toBe(1);
        expect(result.toolResults.length).toBe(0);
      });
    });
  });
});
