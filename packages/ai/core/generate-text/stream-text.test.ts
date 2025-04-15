import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import { delay } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
  convertResponseStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import assert from 'node:assert';
import { z } from 'zod';
import { ToolExecutionError } from '../../errors/tool-execution-error';
import { StreamData } from '../../streams/stream-data';
import { createDataStream } from '../data-stream/create-data-stream';
import { MockLanguageModelV2 } from '../test/mock-language-model-v1';
import { createMockServerResponse } from '../test/mock-server-response';
import { MockTracer } from '../test/mock-tracer';
import { mockValues } from '../test/mock-values';
import { Tool, tool } from '../tool/tool';
import { jsonSchema } from '../util';
import { object, text } from './output';
import { StepResult } from './step-result';
import { streamText } from './stream-text';
import { StreamTextResult, TextStreamPart } from './stream-text-result';
import { ToolSet } from './tool-set';

const defaultSettings = () =>
  ({
    prompt: 'prompt',
    experimental_generateMessageId: mockId({ prefix: 'msg' }),
    _internal: {
      generateId: mockId({ prefix: 'id' }),
      currentDate: () => new Date(0),
    },
  }) as const;

function createTestModel({
  stream = convertArrayToReadableStream([
    {
      type: 'response-metadata',
      id: 'id-0',
      modelId: 'mock-model-id',
      timestamp: new Date(0),
    },
    { type: 'text', text: 'Hello' },
    { type: 'text', text: ', ' },
    { type: 'text', text: `world!` },
    {
      type: 'finish',
      finishReason: 'stop',
      logprobs: undefined,
      usage: { inputTokens: 3, outputTokens: 10 },
    },
  ]),
  request = undefined,
  response = undefined,
  warnings,
}: {
  stream?: ReadableStream<LanguageModelV2StreamPart>;
  request?: { body: string };
  response?: { headers: Record<string, string> };
  warnings?: LanguageModelV2CallWarning[];
} = {}): LanguageModelV2 {
  return new MockLanguageModelV2({
    doStream: async () => ({ stream, request, response, warnings }),
  });
}

const modelWithSources = new MockLanguageModelV2({
  doStream: async () => ({
    stream: convertArrayToReadableStream([
      {
        type: 'source',
        sourceType: 'url',
        id: '123',
        url: 'https://example.com',
        title: 'Example',
        providerMetadata: { provider: { custom: 'value' } },
      },
      { type: 'text', text: 'Hello!' },
      {
        type: 'source',
        sourceType: 'url',
        id: '456',
        url: 'https://example.com/2',
        title: 'Example 2',
        providerMetadata: { provider: { custom: 'value2' } },
      },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { inputTokens: 3, outputTokens: 10 },
      },
    ]),
  }),
});

const modelWithFiles = new MockLanguageModelV2({
  doStream: async () => ({
    stream: convertArrayToReadableStream([
      {
        type: 'file',
        data: 'Hello World',
        mediaType: 'text/plain',
      },
      { type: 'text', text: 'Hello!' },
      {
        type: 'file',
        data: 'QkFVRw==',
        mediaType: 'image/jpeg',
      },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { inputTokens: 3, outputTokens: 10 },
      },
    ]),
  }),
});

const modelWithReasoning = new MockLanguageModelV2({
  doStream: async () => ({
    stream: convertArrayToReadableStream([
      {
        type: 'response-metadata',
        id: 'id-0',
        modelId: 'mock-model-id',
        timestamp: new Date(0),
      },
      {
        type: 'reasoning',
        reasoningType: 'text',
        text: 'I will open the conversation',
      },
      {
        type: 'reasoning',
        reasoningType: 'text',
        text: ' with witty banter. ',
      },
      {
        type: 'reasoning',
        reasoningType: 'signature',
        signature: '1234567890',
      },
      {
        type: 'reasoning',
        reasoningType: 'redacted',
        data: 'redacted-reasoning-data',
      },
      {
        type: 'reasoning',
        reasoningType: 'text',
        text: 'Once the user has relaxed,',
      },
      {
        type: 'reasoning',
        reasoningType: 'text',
        text: ' I will pry for valuable information.',
      },
      {
        type: 'reasoning',
        reasoningType: 'signature',
        signature: '1234567890',
      },
      { type: 'text', text: 'Hi' },
      { type: 'text', text: ' there!' },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { inputTokens: 3, outputTokens: 10 },
      },
    ]),
  }),
});

describe('streamText', () => {
  describe('result.textStream', () => {
    it('should send text deltas', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ prompt }) => {
            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerOptions: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text', text: 'Hello' },
                { type: 'text', text: ', ' },
                { type: 'text', text: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { inputTokens: 3, outputTokens: 10 },
                },
              ]),
            };
          },
        }),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toStrictEqual(['Hello', ', ', 'world!']);
    });

    it('should filter out empty text deltas', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: '' },
            { type: 'text', text: 'Hello' },
            { type: 'text', text: '' },
            { type: 'text', text: ', ' },
            { type: 'text', text: '' },
            { type: 'text', text: 'world!' },
            { type: 'text', text: '' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toMatchSnapshot();
    });

    it('should not include reasoning content in textStream', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toMatchSnapshot();
    });

    it('should swallow error to prevent server crash', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toMatchSnapshot();
    });
  });

  describe('result.fullStream', () => {
    it('should send text deltas', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ prompt }) => {
            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerOptions: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'response-id',
                  modelId: 'response-model-id',
                  timestamp: new Date(5000),
                },
                { type: 'text', text: 'Hello' },
                { type: 'text', text: ', ' },
                { type: 'text', text: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { inputTokens: 3, outputTokens: 10 },
                },
              ]),
            };
          },
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send reasoning deltas', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send sources', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send files', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should use fallback response metadata when response metadata is not provided', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ prompt }) => {
            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerOptions: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text', text: 'Hello' },
                { type: 'text', text: ', ' },
                { type: 'text', text: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { inputTokens: 3, outputTokens: 10 },
                },
              ]),
            };
          },
        }),
        prompt: 'test-input',
        _internal: {
          currentDate: mockValues(new Date(2000)),
          generateId: mockValues('id-2000'),
        },
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send tool calls', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ prompt, tools, toolChoice }) => {
            expect(tools).toStrictEqual([
              {
                type: 'function',
                name: 'tool1',
                description: undefined,
                parameters: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
              },
            ]);

            expect(toolChoice).toStrictEqual({ type: 'required' });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerOptions: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  args: `{ "value": "value" }`,
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { inputTokens: 3, outputTokens: 10 },
                },
              ]),
            };
          },
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should not send tool call deltas when toolCallStreaming is disabled', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ prompt, tools, toolChoice }) => {
            expect(tools).toStrictEqual([
              {
                type: 'function',
                name: 'test-tool',
                description: undefined,
                parameters: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
              },
            ]);

            expect(toolChoice).toStrictEqual({ type: 'required' });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerOptions: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: '{"',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: 'value',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: '":"',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: 'Spark',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: 'le',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: ' Day',
                },
                {
                  type: 'tool-call-delta',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  argsTextDelta: '"}',
                },
                {
                  type: 'tool-call',
                  toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
                  toolCallType: 'function',
                  toolName: 'test-tool',
                  args: '{"value":"Sparkle Day"}',
                },
                {
                  type: 'finish',
                  finishReason: 'tool-calls',
                  logprobs: undefined,
                  usage: { inputTokens: 53, outputTokens: 17 },
                },
              ]),
            };
          },
        }),
        tools: {
          'test-tool': {
            parameters: z.object({ value: z.string() }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send tool call deltas when toolCallStreaming is enabled', async () => {
      const result = streamText({
        toolCallStreaming: true,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: '{"',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: 'value',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: '":"',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: 'Spark',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: 'le',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: ' Day',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              argsTextDelta: '"}',
            },
            {
              type: 'tool-call',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolCallType: 'function',
              toolName: 'test-tool',
              args: '{"value":"Sparkle Day"}',
            },
            {
              type: 'finish',
              finishReason: 'tool-calls',
              logprobs: undefined,
              usage: { inputTokens: 53, outputTokens: 17 },
            },
          ]),
        }),
        tools: {
          'test-tool': {
            parameters: z.object({ value: z.string() }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send tool results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: tool({
            parameters: z.object({ value: z.string() }),
            execute: async (args, options) => {
              expect(args).toStrictEqual({ value: 'value' });
              expect(options.messages).toStrictEqual([
                { role: 'user', content: 'test-input' },
              ]);
              return `${args.value}-result`;
            },
          }),
        },
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send delayed asynchronous tool results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(50); // delay to show bug where step finish is sent before tool result
              return `${value}-result`;
            },
          },
        },
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should filter out empty text deltas', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text', text: '' },
            { type: 'text', text: 'Hello' },
            { type: 'text', text: '' },
            { type: 'text', text: ', ' },
            { type: 'text', text: '' },
            { type: 'text', text: 'world!' },
            { type: 'text', text: '' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should forward error in doStream as error stream part', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
    });
  });

  describe('result.pipeDataStreamToResponse', async () => {
    it('should write data stream parts to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.pipeDataStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });
      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should create a Response with a data stream and custom headers', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.pipeDataStreamToResponse(mockResponse, {
        status: 201,
        statusText: 'foo',
        headers: {
          'custom-header': 'custom-value',
        },
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(201);
      expect(mockResponse.statusMessage).toBe('foo');

      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
        'custom-header': 'custom-value',
      });

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should support merging with existing stream data', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const streamData = new StreamData();
      streamData.append('stream-data-value');
      streamData.close();

      result.pipeDataStreamToResponse(mockResponse, {
        data: streamData,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should mask error messages by default', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.pipeDataStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.pipeDataStreamToResponse(mockResponse, {
        getErrorMessage: error => `custom error message: ${error}`,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should suppress usage information when sendUsage is false', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.pipeDataStreamToResponse(mockResponse, { sendUsage: false });

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should omit message finish event (d:) when sendFinish is false', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        ...defaultSettings(),
      });

      result.pipeDataStreamToResponse(mockResponse, {
        experimental_sendFinish: false,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should write reasoning content to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.pipeDataStreamToResponse(mockResponse, {
        sendReasoning: true,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });
      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should write source content to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      result.pipeDataStreamToResponse(mockResponse, {
        sendSources: true,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });
      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should write file content to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      result.pipeDataStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });
      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });
  });

  describe('result.pipeTextStreamToResponse', async () => {
    it('should write text deltas to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello' },
            { type: 'text', text: ', ' },
            { type: 'text', text: 'world!' },
          ]),
        }),
        prompt: 'test-input',
      });

      result.pipeTextStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
      });
      expect(mockResponse.getDecodedChunks()).toEqual([
        'Hello',
        ', ',
        'world!',
      ]);
    });
  });

  describe('result.toDataStream', () => {
    it('should create a data stream', async () => {
      const result = streamText({
        model: createTestModel(),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream();

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should support merging with existing stream data', async () => {
      const result = streamText({
        model: createTestModel(),
        ...defaultSettings(),
      });

      const streamData = new StreamData();
      streamData.append('stream-data-value');
      streamData.close();

      const dataStream = result.toDataStream({ data: streamData });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should send tool call and tool result stream parts', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '{ "value":',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: ' "value" }',
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        ...defaultSettings(),
      });

      expect(
        await convertReadableStreamToArray(
          result.toDataStream().pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should send tool call, tool call stream start, tool call deltas, and tool result stream parts when tool call delta flag is enabled', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '{ "value":',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: ' "value" }',
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        toolCallStreaming: true,
        ...defaultSettings(),
      });

      expect(
        await convertReadableStreamToArray(
          result.toDataStream().pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should mask error messages by default', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream();

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream({
        getErrorMessage: error => `custom error message: ${error}`,
      });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should suppress usage information when sendUsage is false', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream({ sendUsage: false });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should omit message finish event (d:) when sendFinish is false', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream({
        experimental_sendFinish: false,
      });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should send reasoning content when sendReasoning is true', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream({ sendReasoning: true });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should send source content when sendSources is true', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream({ sendSources: true });

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });

    it('should send file content', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      const dataStream = result.toDataStream();

      expect(
        await convertReadableStreamToArray(
          dataStream.pipeThrough(new TextDecoderStream()),
        ),
      ).toMatchSnapshot();
    });
  });

  describe('result.toDataStreamResponse', () => {
    it('should create a Response with a data stream', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponse();

      expect(response.status).toStrictEqual(200);
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      });
      expect(response.headers.get('Content-Type')).toStrictEqual(
        'text/plain; charset=utf-8',
      );
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should create a Response with a data stream and custom headers', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponse({
        status: 201,
        statusText: 'foo',
        headers: {
          'custom-header': 'custom-value',
        },
      });

      expect(response.status).toStrictEqual(201);
      expect(response.statusText).toStrictEqual('foo');
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
        'custom-header': 'custom-value',
      });
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should support merging with existing stream data', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const streamData = new StreamData();
      streamData.append('stream-data-value');
      streamData.close();

      const response = result.toDataStreamResponse({ data: streamData });

      expect(response.status).toStrictEqual(200);
      expect(response.headers.get('Content-Type')).toStrictEqual(
        'text/plain; charset=utf-8',
      );
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should mask error messages by default', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponse();

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponse({
        getErrorMessage: error => `custom error message: ${error}`,
      });

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should suppress usage information when sendUsage is false', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponse({ sendUsage: false });

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });
  });

  describe('result.mergeIntoDataStream', () => {
    it('should merge the result into a data stream', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const dataStream = createDataStream({
        execute(writer) {
          result.mergeIntoDataStream(writer);
        },
      });

      expect(await convertReadableStreamToArray(dataStream)).toMatchSnapshot();
    });

    it('should use the onError handler from the data stream', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const dataStream = createDataStream({
        execute(writer) {
          result.mergeIntoDataStream(writer);
        },
        onError: error => `custom error message: ${error}`,
      });

      expect(await convertReadableStreamToArray(dataStream)).toMatchSnapshot();
    });
  });

  describe('result.toTextStreamResponse', () => {
    it('should create a Response with a text stream', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
      });

      const response = result.toTextStreamResponse();

      expect(response.status).toStrictEqual(200);
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
      });
      expect(await convertResponseStreamToArray(response)).toStrictEqual([
        'Hello',
        ', ',
        'world!',
      ]);
    });
  });

  describe('result.consumeStream', () => {
    it('should ignore AbortError during stream consumption', async () => {
      const result = streamText({
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text', text: 'Hello' });
              queueMicrotask(() => {
                controller.error(
                  Object.assign(new Error('Stream aborted'), {
                    name: 'AbortError',
                  }),
                );
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(result.consumeStream()).resolves.not.toThrow();
    });

    it('should ignore ResponseAborted error during stream consumption', async () => {
      const result = streamText({
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text', text: 'Hello' });
              queueMicrotask(() => {
                controller.error(
                  Object.assign(new Error('Response aborted'), {
                    name: 'ResponseAborted',
                  }),
                );
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(result.consumeStream()).resolves.not.toThrow();
    });

    it('should ignore any errors during stream consumption', async () => {
      const result = streamText({
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text', text: 'Hello' });
              queueMicrotask(() => {
                controller.error(Object.assign(new Error('Some error')));
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(result.consumeStream()).resolves.not.toThrow();
    });

    it('should call the onError callback with the error', async () => {
      const onErrorCallback = vi.fn();
      const result = streamText({
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text', text: 'Hello' });
              queueMicrotask(() => {
                controller.error(Object.assign(new Error('Some error')));
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(
        result.consumeStream({ onError: onErrorCallback }),
      ).resolves.not.toThrow();
      expect(onErrorCallback).toHaveBeenCalledWith(new Error('Some error'));
    });
  });

  describe('multiple stream consumption', () => {
    it('should support text stream, ai stream, full stream on single result object', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text', text: 'Hello' },
            { type: 'text', text: ', ' },
            { type: 'text', text: 'world!' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect({
        textStream: await convertAsyncIterableToArray(result.textStream),
        fullStream: await convertAsyncIterableToArray(result.fullStream),
        dataStream: await convertReadableStreamToArray(
          result.toDataStream().pipeThrough(new TextDecoderStream()),
        ),
      }).toMatchSnapshot();
    });
  });

  describe('result.warnings', () => {
    it('should resolve with warnings', async () => {
      const result = streamText({
        model: createTestModel({
          warnings: [{ type: 'other', message: 'test-warning' }],
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.warnings).toStrictEqual([
        { type: 'other', message: 'test-warning' },
      ]);
    });
  });

  describe('result.usage', () => {
    it('should resolve with token usage', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      assert.deepStrictEqual(await result.usage, {
        completionTokens: 10,
        promptTokens: 3,
        totalTokens: 13,
      });
    });
  });

  describe('result.finishReason', () => {
    it('should resolve with finish reason', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.finishReason).toStrictEqual('stop');
    });
  });

  describe('result.providerMetadata', () => {
    it('should resolve with provider metadata', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.providerMetadata).toStrictEqual({
        testProvider: { testKey: 'testValue' },
      });
    });
  });

  describe('result.response.messages', () => {
    it('should contain reasoning', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect((await result.response).messages).toMatchSnapshot();
    });
  });

  describe('result.request', () => {
    it('should resolve with response information', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text', text: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
          request: { body: 'test body' },
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.request).toStrictEqual({
        body: 'test body',
      });
    });
  });

  describe('result.response', () => {
    it('should resolve with response information', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text', text: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
          response: { headers: { call: '2' } },
        }),
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.response).toMatchSnapshot();
    });
  });

  describe('result.text', () => {
    it('should resolve with full text', async () => {
      const result = streamText({
        model: createTestModel(),
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.text).toMatchSnapshot();
    });
  });

  describe('result.reasoningText', () => {
    it('should contain reasoning text from model response', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.reasoningText).toMatchSnapshot();
    });
  });

  describe('result.reasoning', () => {
    it('should contain reasoning from model response', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.reasoning).toMatchSnapshot();
    });
  });

  describe('result.sources', () => {
    it('should contain sources', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.sources).toMatchSnapshot();
    });
  });

  describe('result.files', () => {
    it('should contain files', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.files).toMatchSnapshot();
    });
  });

  describe('result.steps', () => {
    it('should add the reasoning from the model response to the step result', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.steps).toMatchSnapshot();
    });

    it('should add the sources from the model response to the step result', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.steps).toMatchSnapshot();
    });

    it('should add the files from the model response to the step result', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.steps).toMatchSnapshot();
    });
  });

  describe('result.toolCalls', () => {
    it('should resolve with tool calls', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
          },
        },
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.toolCalls).toStrictEqual([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
        },
      ]);
    });
  });

  describe('result.toolResults', () => {
    it('should resolve with tool results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
      });

      result.consumeStream();

      assert.deepStrictEqual(await result.toolResults, [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
          result: 'value-result',
        },
      ]);
    });
  });

  describe('options.onChunk', () => {
    let result: Array<
      Extract<
        TextStreamPart<any>,
        {
          type:
            | 'text'
            | 'reasoning'
            | 'source'
            | 'tool-call'
            | 'tool-call-streaming-start'
            | 'tool-call-delta'
            | 'tool-result';
        }
      >
    >;

    beforeEach(async () => {
      result = [];

      const resultObject = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello' },
            {
              type: 'tool-call-delta',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '{"value": "',
            },
            {
              type: 'reasoning',
              reasoningType: 'text',
              text: 'Feeling clever',
            },
            {
              type: 'tool-call-delta',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: 'test',
            },
            {
              type: 'tool-call-delta',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '"}',
            },
            {
              type: 'source',
              sourceType: 'url',
              id: '123',
              url: 'https://example.com',
              title: 'Example',
              providerMetadata: { provider: { custom: 'value' } },
            },
            {
              type: 'tool-call',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              args: `{ "value": "test" }`,
            },
            { type: 'text', text: ' World' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 10, outputTokens: 20 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
        toolCallStreaming: true,
        onChunk(event) {
          result.push(event.chunk);
        },
      });

      await resultObject.consumeStream();
    });

    it('should return events in order', async () => {
      expect(result).toMatchSnapshot();
    });
  });

  describe('options.onError', () => {
    it('should invoke onError', async () => {
      const result: Array<{ error: unknown }> = [];

      const resultObject = streamText({
        model: new MockLanguageModelV2({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
        onError(event) {
          result.push(event);
        },
      });

      await resultObject.consumeStream();

      expect(result).toStrictEqual([{ error: new Error('test error') }]);
    });
  });

  describe('options.onFinish', () => {
    it('should send correct information', async () => {
      let result!: Parameters<
        Required<Parameters<typeof streamText>[0]>['onFinish']
      >[0];

      const resultObject = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text', text: 'Hello' },
            { type: 'text', text: ', ' },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            { type: 'text', text: `world!` },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
          response: { headers: { call: '2' } },
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        onFinish: async event => {
          result = event as unknown as typeof result;
        },
        ...defaultSettings(),
      });

      await resultObject.consumeStream();

      expect(result).toMatchSnapshot();
    });

    it('should send sources', async () => {
      let result!: Parameters<
        Required<Parameters<typeof streamText>[0]>['onFinish']
      >[0];

      const resultObject = streamText({
        model: modelWithSources,
        onFinish: async event => {
          result = event as unknown as typeof result;
        },
        ...defaultSettings(),
      });

      await resultObject.consumeStream();

      expect(result).toMatchSnapshot();
    });

    it('should send files', async () => {
      let result!: Parameters<
        Required<Parameters<typeof streamText>[0]>['onFinish']
      >[0];

      const resultObject = streamText({
        model: modelWithFiles,
        onFinish: async event => {
          result = event as unknown as typeof result;
        },
        ...defaultSettings(),
      });

      await resultObject.consumeStream();

      expect(result).toMatchSnapshot();
    });

    it('should not prevent error from being forwarded', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
        onFinish() {}, // just defined; do nothing
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
    });
  });

  describe('result.responseMessages', () => {
    it('should contain assistant response message when there are no tool calls', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello, ' },
            { type: 'text', text: 'world!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.consumeStream();

      expect((await result.response).messages).toMatchSnapshot();
    });

    it('should contain assistant response message and tool message when there are tool calls with results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text', text: 'Hello, ' },
            { type: 'text', text: 'world!' },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
        },
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      result.consumeStream();

      expect((await result.response).messages).toMatchSnapshot();
    });
  });

  describe('options.maxSteps', () => {
    let result: StreamTextResult<any, any>;
    let onFinishResult: Parameters<
      Required<Parameters<typeof streamText>[0]>['onFinish']
    >[0];
    let onStepFinishResults: StepResult<any>[];
    let tracer: MockTracer;

    beforeEach(() => {
      tracer = new MockTracer();
    });

    describe('2 steps: initial, tool-result', () => {
      beforeEach(async () => {
        result = undefined as any;
        onFinishResult = undefined as any;
        onStepFinishResults = [];

        let responseCount = 0;
        result = streamText({
          model: new MockLanguageModelV2({
            doStream: async ({ prompt, tools, toolChoice }) => {
              switch (responseCount++) {
                case 0: {
                  expect(tools).toStrictEqual([
                    {
                      type: 'function',
                      name: 'tool1',
                      description: undefined,
                      parameters: {
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        additionalProperties: false,
                        properties: { value: { type: 'string' } },
                        required: ['value'],
                        type: 'object',
                      },
                    },
                  ]);

                  expect(toolChoice).toStrictEqual({ type: 'auto' });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerOptions: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      {
                        type: 'reasoning',
                        reasoningType: 'text',
                        text: 'thinking',
                      },
                      {
                        type: 'tool-call',
                        toolCallType: 'function',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        args: `{ "value": "value" }`,
                      },
                      {
                        type: 'finish',
                        finishReason: 'tool-calls',
                        logprobs: undefined,
                        usage: { inputTokens: 3, outputTokens: 10 },
                      },
                    ]),
                    response: { headers: { call: '1' } },
                  };
                }
                case 1: {
                  expect(tools).toStrictEqual([
                    {
                      type: 'function',
                      name: 'tool1',
                      description: undefined,
                      parameters: {
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        additionalProperties: false,
                        properties: { value: { type: 'string' } },
                        required: ['value'],
                        type: 'object',
                      },
                    },
                  ]);

                  expect(toolChoice).toStrictEqual({ type: 'auto' });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerOptions: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'reasoning',
                          text: 'thinking',
                          providerOptions: undefined,
                          signature: undefined,
                        },
                        {
                          type: 'tool-call',
                          toolCallId: 'call-1',
                          toolName: 'tool1',
                          args: { value: 'value' },
                          providerOptions: undefined,
                        },
                      ],
                      providerOptions: undefined,
                    },
                    {
                      role: 'tool',
                      content: [
                        {
                          type: 'tool-result',
                          toolCallId: 'call-1',
                          toolName: 'tool1',
                          result: 'result1',
                          content: undefined,
                          isError: undefined,
                          providerOptions: undefined,
                        },
                      ],
                      providerOptions: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      { type: 'text', text: 'Hello, ' },
                      { type: 'text', text: `world!` },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        logprobs: undefined,
                        usage: { inputTokens: 1, outputTokens: 5 },
                      },
                    ]),
                    response: { headers: { call: '2' } },
                  };
                }
                default:
                  throw new Error(
                    `Unexpected response count: ${responseCount}`,
                  );
              }
            },
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          prompt: 'test-input',
          onFinish: async event => {
            expect(onFinishResult).to.be.undefined;
            onFinishResult = event as unknown as typeof onFinishResult;
          },
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          experimental_telemetry: { isEnabled: true, tracer },
          maxSteps: 3,
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
          },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });
      });

      it('should contain assistant response message and tool message from all steps', async () => {
        expect(
          await convertAsyncIterableToArray(result.fullStream),
        ).toMatchSnapshot();
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchSnapshot();
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchSnapshot();
        });
      });

      describe('value promises', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('result.usage should contain total token usage', async () => {
          assert.deepStrictEqual(await result.usage, {
            completionTokens: 15,
            promptTokens: 4,
            totalTokens: 19,
          });
        });

        it('result.finishReason should contain finish reason from final step', async () => {
          assert.strictEqual(await result.finishReason, 'stop');
        });

        it('result.text should contain text from final step', async () => {
          assert.strictEqual(await result.text, 'Hello, world!');
        });

        it('result.steps should contain all steps', async () => {
          expect(await result.steps).toMatchSnapshot();
        });

        it('result.response.messages should contain response messages from all steps', async () => {
          expect((await result.response).messages).toMatchSnapshot();
        });
      });

      it('should record telemetry data for each step', async () => {
        await result.consumeStream();
        expect(tracer.jsonSpans).toMatchSnapshot();
      });
    });

    describe('4 steps: initial, continue, continue, continue', () => {
      beforeEach(async () => {
        result = undefined as any;
        onFinishResult = undefined as any;
        onStepFinishResults = [];

        let responseCount = 0;
        result = streamText({
          model: new MockLanguageModelV2({
            doStream: async ({ prompt }) => {
              switch (responseCount++) {
                case 0: {
                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerOptions: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      // trailing text is to be discarded, trailing whitespace is to be kept:
                      { type: 'text', text: 'pa' },
                      { type: 'text', text: 'rt ' },
                      { type: 'text', text: '1 \n' },
                      { type: 'text', text: ' to-be' },
                      { type: 'text', text: '-discar' },
                      { type: 'text', text: 'ded' },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { inputTokens: 10, outputTokens: 20 },
                      },
                    ]),
                  };
                }
                case 1: {
                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerOptions: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerOptions: undefined,
                        },
                      ],
                      providerOptions: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      // case where there is no leading nor trailing whitespace:
                      { type: 'text', text: 'no-' },
                      {
                        type: 'source',
                        sourceType: 'url' as const,
                        id: '123',
                        url: 'https://example.com',
                        title: 'Example',
                        providerMetadata: { provider: { custom: 'value' } },
                      },
                      { type: 'text', text: 'whitespace' },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { inputTokens: 30, outputTokens: 5 },
                      },
                    ]),
                  };
                }
                case 2: {
                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerOptions: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerOptions: undefined,
                        },
                        {
                          type: 'text',
                          text: 'no-whitespace',
                          providerOptions: undefined,
                        },
                      ],
                      providerOptions: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-2',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      {
                        type: 'source',
                        sourceType: 'url' as const,
                        id: '456',
                        url: 'https://example.com/2',
                        title: 'Example 2',
                        providerMetadata: { provider: { custom: 'value2' } },
                      },
                      // set up trailing whitespace for next step:
                      { type: 'text', text: 'immediatefollow  ' },
                      {
                        type: 'source',
                        sourceType: 'url' as const,
                        id: '789',
                        url: 'https://example.com/3',
                        title: 'Example 3',
                        providerMetadata: { provider: { custom: 'value3' } },
                      },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { inputTokens: 3, outputTokens: 2 },
                      },
                    ]),
                    response: { headers: { call: '3' } },
                  };
                }
                case 3: {
                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerOptions: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerOptions: undefined,
                        },
                        {
                          type: 'text',
                          text: 'no-whitespace',
                          providerOptions: undefined,
                        },
                        {
                          type: 'text',
                          text: 'immediatefollow  ',
                          providerOptions: undefined,
                        },
                      ],
                      providerOptions: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-3',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      // leading whitespace is to be discarded when there is whitespace from previous step
                      // (for models such as Anthropic that trim trailing whitespace in their inputs):
                      { type: 'text', text: ' ' }, // split into 2 chunks for test coverage
                      { type: 'text', text: '  final' },
                      { type: 'text', text: ' va' },
                      { type: 'text', text: 'lue keep all w' },
                      { type: 'text', text: 'hitespace' },
                      { type: 'text', text: '\n ' },
                      { type: 'text', text: 'en' },
                      { type: 'text', text: 'd' },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        logprobs: undefined,
                        usage: { inputTokens: 3, outputTokens: 2 },
                      },
                    ]),
                    response: { headers: { call: '3' } },
                  };
                }
                default:
                  throw new Error(
                    `Unexpected response count: ${responseCount}`,
                  );
              }
            },
          }),
          prompt: 'test-input',
          maxSteps: 5,
          experimental_continueSteps: true,
          onFinish: async event => {
            expect(onFinishResult).to.be.undefined;
            onFinishResult = event as unknown as typeof onFinishResult;
          },
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          experimental_telemetry: { isEnabled: true, tracer },
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
          },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });
      });

      it('should contain text deltas from all steps', async () => {
        expect(
          await convertAsyncIterableToArray(result.fullStream),
        ).toMatchSnapshot();
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchSnapshot();
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchSnapshot();
        });
      });

      describe('value promises', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('result.usage should contain total token usage', async () => {
          expect(await result.usage).toStrictEqual({
            completionTokens: 29,
            promptTokens: 46,
            totalTokens: 75,
          });
        });

        it('result.finishReason should contain finish reason from final step', async () => {
          assert.strictEqual(await result.finishReason, 'stop');
        });

        it('result.text should contain combined text from all steps', async () => {
          assert.strictEqual(
            await result.text,
            'part 1 \n no-whitespaceimmediatefollow  final value keep all whitespace\n end',
          );
        });

        it('result.steps should contain all steps', async () => {
          expect(await result.steps).toMatchSnapshot();
        });

        it('result.response.messages should contain an assistant message with the combined text', async () => {
          expect((await result.response).messages).toStrictEqual([
            {
              role: 'assistant',
              id: expect.any(String),
              content: [
                {
                  type: 'text',
                  text: 'part 1 \n no-whitespaceimmediatefollow  final value keep all whitespace\n end',
                },
              ],
            },
          ]);
        });
      });

      it('should record telemetry data for each step', async () => {
        await result.consumeStream();
        expect(tracer.jsonSpans).toMatchSnapshot();
      });

      it('should generate correct data stream', async () => {
        const dataStream = result.toDataStream();

        expect(
          await convertReadableStreamToArray(
            dataStream.pipeThrough(new TextDecoderStream()),
          ),
        ).toMatchSnapshot();
      });

      it('result.sources should contain sources from all steps', async () => {
        result.consumeStream();
        expect(await result.sources).toMatchSnapshot();
      });
    });
  });

  describe('options.headers', () => {
    it('should set headers', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ headers }) => {
            expect(headers).toStrictEqual({
              'custom-request-header': 'request-header-value',
            });

            return {
              stream: convertArrayToReadableStream([
                { type: 'text', text: 'Hello' },
                { type: 'text', text: ', ' },
                { type: 'text', text: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { inputTokens: 3, outputTokens: 10 },
                },
              ]),
            };
          },
        }),
        prompt: 'test-input',
        headers: { 'custom-request-header': 'request-header-value' },
      });

      assert.deepStrictEqual(
        await convertAsyncIterableToArray(result.textStream),
        ['Hello', ', ', 'world!'],
      );
    });
  });

  describe('options.providerMetadata', () => {
    it('should pass provider metadata to model', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ providerOptions }) => {
            expect(providerOptions).toStrictEqual({
              aProvider: { someKey: 'someValue' },
            });

            return {
              stream: convertArrayToReadableStream([
                { type: 'text', text: 'provider metadata test' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { inputTokens: 3, outputTokens: 10 },
                },
              ]),
            };
          },
        }),
        prompt: 'test-input',
        providerOptions: {
          aProvider: { someKey: 'someValue' },
        },
      });

      assert.deepStrictEqual(
        await convertAsyncIterableToArray(result.textStream),
        ['provider metadata test'],
      );
    });
  });

  describe('options.abortSignal', () => {
    it('should forward abort signal to tool execution during streaming', async () => {
      const abortController = new AbortController();
      const toolExecuteMock = vi.fn().mockResolvedValue('tool result');

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 10, outputTokens: 20 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: toolExecuteMock,
          },
        },
        prompt: 'test-input',
        abortSignal: abortController.signal,
      });

      await convertAsyncIterableToArray(result.fullStream);

      abortController.abort();

      expect(toolExecuteMock).toHaveBeenCalledWith(
        { value: 'value' },
        {
          abortSignal: abortController.signal,
          toolCallId: 'call-1',
          messages: expect.any(Array),
        },
      );
    });
  });

  describe('telemetry', () => {
    let tracer: MockTracer;

    beforeEach(() => {
      tracer = new MockTracer();
    });

    it('should not record any telemetry data when not explicitly enabled', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        _internal: {
          now: mockValues(0, 100, 500),
        },
      });

      await result.consumeStream();

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should record telemetry data when enabled', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        topK: 0.1,
        topP: 0.2,
        frequencyPenalty: 0.3,
        presencePenalty: 0.4,
        temperature: 0.5,
        stopSequences: ['stop'],
        headers: {
          header1: 'value1',
          header2: 'value2',
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'test-function-id',
          metadata: {
            test1: 'value1',
            test2: false,
          },
          tracer,
        },
        _internal: { now: mockValues(0, 100, 500) },
      });

      await result.consumeStream();

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should record successful tool call', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 10, outputTokens: 20 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
        experimental_telemetry: { isEnabled: true, tracer },
        _internal: { now: mockValues(0, 100, 500) },
      });

      await result.consumeStream();

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should not record telemetry inputs / outputs when disabled', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 10, outputTokens: 20 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: false,
          recordOutputs: false,
          tracer,
        },
        _internal: { now: mockValues(0, 100, 500) },
      });

      await result.consumeStream();

      expect(tracer.jsonSpans).toMatchSnapshot();
    });
  });

  describe('tools with custom schema', () => {
    it('should send tool calls', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ prompt, tools, toolChoice }) => {
            expect(tools).toStrictEqual([
              {
                type: 'function',
                name: 'tool1',
                description: undefined,
                parameters: {
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
              },
            ]);
            expect(toolChoice).toStrictEqual({ type: 'required' });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerOptions: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  args: `{ "value": "value" }`,
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { inputTokens: 3, outputTokens: 10 },
                },
              ]),
            };
          },
        }),
        tools: {
          tool1: {
            parameters: jsonSchema<{ value: string }>({
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
            }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
        _internal: {
          now: mockValues(0, 100, 500),
        },
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });
  });

  describe('options.messages', () => {
    it('should detect and convert ui messages', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ prompt }) => {
            expect(prompt).toStrictEqual([
              {
                content: [
                  {
                    text: 'prompt',
                    type: 'text',
                  },
                ],
                providerOptions: undefined,
                role: 'user',
              },
              {
                content: [
                  {
                    args: {
                      value: 'test-value',
                    },
                    providerOptions: undefined,
                    toolCallId: 'call-1',
                    toolName: 'test-tool',
                    type: 'tool-call',
                  },
                ],
                providerOptions: undefined,
                role: 'assistant',
              },
              {
                content: [
                  {
                    content: undefined,
                    isError: undefined,
                    providerOptions: undefined,
                    result: 'test result',
                    toolCallId: 'call-1',
                    toolName: 'test-tool',
                    type: 'tool-result',
                  },
                ],
                providerOptions: undefined,
                role: 'tool',
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text', text: 'Hello' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { inputTokens: 3, outputTokens: 10 },
                },
              ]),
            };
          },
        }),
        messages: [
          {
            role: 'user',
            content: 'prompt',
          },
          {
            role: 'assistant',
            content: '',
            toolInvocations: [
              {
                state: 'result',
                toolCallId: 'call-1',
                toolName: 'test-tool',
                args: { value: 'test-value' },
                result: 'test result',
              },
            ],
          },
        ],
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toStrictEqual(['Hello']);
    });

    it('should support models that use "this" context in supportsUrl', async () => {
      let supportsUrlCalled = false;
      class MockLanguageModelWithImageSupport extends MockLanguageModelV2 {
        readonly supportsImageUrls = false;

        constructor() {
          super({
            supportsUrl(url: URL) {
              supportsUrlCalled = true;
              // Reference 'this' to verify context
              return this.modelId === 'mock-model-id';
            },
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text', text: 'Hello' },
                { type: 'text', text: ', ' },
                { type: 'text', text: 'world!' },
              ]),
            }),
          });
        }
      }

      const model = new MockLanguageModelWithImageSupport();
      const result = streamText({
        model,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', image: 'https://example.com/test.jpg' }],
          },
        ],
      });

      await result.consumeStream();

      expect(supportsUrlCalled).toBe(true);
      expect(await result.text).toBe('Hello, world!');
    });
  });

  describe('tool execution errors', () => {
    it('should send a ToolExecutionError when a tool execution throws an error', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { inputTokens: 3, outputTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: tool({
            parameters: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw new Error('test error');
            },
          }),
        },
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          type: 'step-start',
          request: {},
          warnings: [],
          messageId: expect.any(String),
        },
        {
          type: 'tool-call',
          args: {
            value: 'value',
          },
          toolCallId: 'call-1',
          toolName: 'tool1',
        },
        {
          type: 'error',
          error: new ToolExecutionError({
            toolName: 'tool1',
            toolCallId: 'call-1',
            toolArgs: { value: 'value' },
            cause: new Error('test error'),
          }),
        },
        {
          type: 'step-finish',
          messageId: expect.any(String),
          providerMetadata: undefined,
          finishReason: 'stop',
          isContinued: false,
          logprobs: undefined,
          request: {},
          response: {
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
            headers: undefined,
          },
          warnings: undefined,
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
        },
        {
          type: 'finish',
          providerMetadata: undefined,
          finishReason: 'stop',
          logprobs: undefined,
          response: {
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
            headers: undefined,
          },
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
        },
      ]);
    });
  });

  describe('options.transform', () => {
    describe('with base transformation', () => {
      const upperCaseTransform = () =>
        new TransformStream<
          TextStreamPart<{ tool1: Tool<{ value: string }> }>,
          TextStreamPart<{ tool1: Tool<{ value: string }> }>
        >({
          transform(chunk, controller) {
            if (chunk.type === 'text') {
              chunk.text = chunk.text.toUpperCase();
            }

            if (chunk.type === 'tool-call-delta') {
              chunk.argsTextDelta = chunk.argsTextDelta.toUpperCase();
            }

            // assuming test arg structure:
            if (chunk.type === 'tool-call') {
              chunk.args = {
                ...chunk.args,
                value: chunk.args.value.toUpperCase(),
              };
            }

            if (chunk.type === 'tool-result') {
              chunk.result = chunk.result.toUpperCase();
              chunk.args = {
                ...chunk.args,
                value: chunk.args.value.toUpperCase(),
              };
            }

            if (chunk.type === 'step-finish') {
              if (chunk.request.body != null) {
                chunk.request.body = (
                  chunk.request.body as string
                ).toUpperCase();
              }
            }

            if (chunk.type === 'finish') {
              if (chunk.providerMetadata?.testProvider != null) {
                chunk.providerMetadata.testProvider = {
                  testKey: 'TEST VALUE',
                };
              }
            }

            controller.enqueue(chunk);
          },
        });

      it('should transform the stream', async () => {
        const result = streamText({
          model: createTestModel(),
          experimental_transform: upperCaseTransform,
          prompt: 'test-input',
        });

        expect(
          await convertAsyncIterableToArray(result.textStream),
        ).toStrictEqual(['HELLO', ', ', 'WORLD!']);
      });

      it('result.text should be transformed', async () => {
        const result = streamText({
          model: createTestModel(),
          experimental_transform: upperCaseTransform,
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.text).toStrictEqual('HELLO, WORLD!');
      });

      it('result.response.messages should be transformed', async () => {
        const result = streamText({
          model: createTestModel(),
          experimental_transform: upperCaseTransform,
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.response).toStrictEqual({
          id: expect.any(String),
          timestamp: expect.any(Date),
          modelId: expect.any(String),
          headers: undefined,
          messages: [
            {
              role: 'assistant',
              id: expect.any(String),
              content: [
                {
                  text: 'HELLO, WORLD!',
                  type: 'text',
                },
              ],
            },
          ],
        });
      });

      it('result.usage should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: 'Hello' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { inputTokens: 5, outputTokens: 20 },
              },
            ]),
          }),
          experimental_transform: () =>
            new TransformStream<TextStreamPart<any>, TextStreamPart<any>>({
              transform(chunk, controller) {
                if (chunk.type === 'finish') {
                  chunk.usage = {
                    completionTokens: 100,
                    promptTokens: 200,
                    totalTokens: 300,
                  };
                }
                controller.enqueue(chunk);
              },
            }),
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.usage).toStrictEqual({
          completionTokens: 100,
          promptTokens: 200,
          totalTokens: 300,
        });
      });

      it('result.finishReason should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: 'Hello' },
              {
                type: 'finish',
                finishReason: 'length',
                logprobs: undefined,
                usage: { inputTokens: 5, outputTokens: 20 },
              },
            ]),
          }),
          experimental_transform: () =>
            new TransformStream<TextStreamPart<any>, TextStreamPart<any>>({
              transform(chunk, controller) {
                if (chunk.type === 'finish') {
                  chunk.finishReason = 'stop';
                }
                controller.enqueue(chunk);
              },
            }),
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.finishReason).toStrictEqual('stop');
      });

      it('result.toolCalls should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: 'Hello, ' },
              { type: 'text', text: 'world!' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseTransform,
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.toolCalls).toStrictEqual([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'tool1',
            args: { value: 'VALUE' },
          },
        ]);
      });

      it('result.toolResults should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: 'Hello, ' },
              { type: 'text', text: 'world!' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseTransform,
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.toolResults).toStrictEqual([
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'tool1',
            args: { value: 'VALUE' },
            result: 'RESULT1',
          },
        ]);
      });

      it('result.steps should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text', text: 'Hello, ' },
              { type: 'text', text: 'world!' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseTransform,
          prompt: 'test-input',
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });

        result.consumeStream();

        expect(await result.steps).toMatchSnapshot();
      });

      it('result.request should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text', text: 'Hello' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
            request: { body: 'test body' },
          }),
          prompt: 'test-input',
          experimental_transform: upperCaseTransform,
        });

        result.consumeStream();

        expect(await result.request).toStrictEqual({
          body: 'TEST BODY',
        });
      });

      it('result.providerMetadata should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text', text: 'Hello' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { inputTokens: 3, outputTokens: 10 },
                providerMetadata: {
                  testProvider: {
                    testKey: 'testValue',
                  },
                },
              },
            ]),
            request: { body: 'test body' },
          }),
          prompt: 'test-input',
          experimental_transform: upperCaseTransform,
        });

        result.consumeStream();

        expect(JSON.stringify(await result.providerMetadata)).toStrictEqual(
          JSON.stringify({
            testProvider: {
              testKey: 'TEST VALUE',
            },
          }),
        );
      });

      it('options.onFinish should receive transformed data', async () => {
        let result!: Parameters<
          Required<Parameters<typeof streamText>[0]>['onFinish']
        >[0];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text', text: 'Hello' },
              { type: 'text', text: ', ' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              { type: 'text', text: `world!` },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { inputTokens: 3, outputTokens: 10 },
                providerMetadata: {
                  testProvider: { testKey: 'testValue' },
                },
              },
            ]),
            response: { headers: { call: '2' } },
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            },
          },
          prompt: 'test-input',
          onFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_transform: upperCaseTransform,
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });

        await resultObject.consumeStream();

        expect(result).toMatchSnapshot();
      });

      it('options.onStepFinish should receive transformed data', async () => {
        let result!: Parameters<
          Required<Parameters<typeof streamText>[0]>['onStepFinish']
        >[0];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text', text: 'Hello' },
              { type: 'text', text: ', ' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              { type: 'text', text: `world!` },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { inputTokens: 3, outputTokens: 10 },
                providerMetadata: {
                  testProvider: { testKey: 'testValue' },
                },
              },
            ]),
            response: { headers: { call: '2' } },
          }),
          tools: {
            tool1: tool({
              parameters: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            }),
          },
          prompt: 'test-input',
          onStepFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_transform: upperCaseTransform,
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });

        await resultObject.consumeStream();

        expect(result).toMatchSnapshot();
      });

      it('telemetry should record transformed data when enabled', async () => {
        const tracer = new MockTracer();

        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text', text: 'Hello' },
              { type: 'text', text: ', ' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
              { type: 'text', text: `world!` },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { inputTokens: 3, outputTokens: 10 },
                providerMetadata: {
                  testProvider: { testKey: 'testValue' },
                },
              },
            ]),
          }),
          tools: {
            tool1: tool({
              parameters: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            }),
          },
          prompt: 'test-input',
          experimental_transform: upperCaseTransform,
          experimental_telemetry: { isEnabled: true, tracer },
          _internal: { now: mockValues(0, 100, 500) },
        });

        await result.consumeStream();

        expect(tracer.jsonSpans).toMatchSnapshot();
      });

      it('it should send transformed chunks to onChunk', async () => {
        const result: Array<
          Extract<
            TextStreamPart<any>,
            {
              type:
                | 'text'
                | 'reasoning'
                | 'source'
                | 'tool-call'
                | 'tool-call-streaming-start'
                | 'tool-call-delta'
                | 'tool-result';
            }
          >
        > = [];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: 'Hello' },
              {
                type: 'reasoning',
                reasoningType: 'text',
                text: 'Feeling clever',
              },
              {
                type: 'tool-call-delta',
                toolCallId: '1',
                toolCallType: 'function',
                toolName: 'tool1',
                argsTextDelta: '{"value": "',
              },
              {
                type: 'tool-call-delta',
                toolCallId: '1',
                toolCallType: 'function',
                toolName: 'tool1',
                argsTextDelta: 'test',
              },
              {
                type: 'tool-call-delta',
                toolCallId: '1',
                toolCallType: 'function',
                toolName: 'tool1',
                argsTextDelta: '"}',
              },
              {
                type: 'tool-call',
                toolCallId: '1',
                toolCallType: 'function',
                toolName: 'tool1',
                args: `{ "value": "test" }`,
              },
              { type: 'text', text: ' World' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 10, outputTokens: 20 },
              },
            ]),
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            },
          },
          prompt: 'test-input',
          toolCallStreaming: true,
          onChunk(event) {
            result.push(event.chunk);
          },
          experimental_transform: upperCaseTransform,
        });

        await resultObject.consumeStream();

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "text": "HELLO",
              "type": "text",
            },
            {
              "reasoningType": "text",
              "text": "Feeling clever",
              "type": "reasoning",
            },
            {
              "toolCallId": "1",
              "toolName": "tool1",
              "type": "tool-call-streaming-start",
            },
            {
              "argsTextDelta": "{"VALUE": "",
              "toolCallId": "1",
              "toolName": "tool1",
              "type": "tool-call-delta",
            },
            {
              "argsTextDelta": "TEST",
              "toolCallId": "1",
              "toolName": "tool1",
              "type": "tool-call-delta",
            },
            {
              "argsTextDelta": ""}",
              "toolCallId": "1",
              "toolName": "tool1",
              "type": "tool-call-delta",
            },
            {
              "args": {
                "value": "TEST",
              },
              "toolCallId": "1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            {
              "args": {
                "value": "TEST",
              },
              "result": "TEST-RESULT",
              "toolCallId": "1",
              "toolName": "tool1",
              "type": "tool-result",
            },
            {
              "text": " WORLD",
              "type": "text",
            },
          ]
        `);
      });
    });

    describe('with multiple transformations', () => {
      const toUppercaseAndAddCommaTransform =
        <TOOLS extends ToolSet>() =>
        (options: { tools: TOOLS }) =>
          new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
            transform(chunk, controller) {
              if (chunk.type !== 'text') {
                controller.enqueue(chunk);
                return;
              }

              controller.enqueue({
                ...chunk,
                text: `${chunk.text.toUpperCase()},`,
              });
            },
          });

      const omitCommaTransform =
        <TOOLS extends ToolSet>() =>
        (options: { tools: TOOLS }) =>
          new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
            transform(chunk, controller) {
              if (chunk.type !== 'text') {
                controller.enqueue(chunk);
                return;
              }

              controller.enqueue({
                ...chunk,
                text: chunk.text.replaceAll(',', ''),
              });
            },
          });

      it('should transform the stream', async () => {
        const result = streamText({
          model: createTestModel(),
          experimental_transform: [
            toUppercaseAndAddCommaTransform(),
            omitCommaTransform(),
          ],
          prompt: 'test-input',
        });

        expect(
          await convertAsyncIterableToArray(result.textStream),
        ).toStrictEqual(['HELLO', ' ', 'WORLD!']);
      });
    });

    describe('with transformation that aborts stream', () => {
      const stopWordTransform =
        <TOOLS extends ToolSet>() =>
        ({ stopStream }: { stopStream: () => void }) =>
          new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
            // note: this is a simplified transformation for testing;
            // in a real-world version more there would need to be
            // stream buffering and scanning to correctly emit prior text
            // and to detect all STOP occurrences.
            transform(chunk, controller) {
              if (chunk.type !== 'text') {
                controller.enqueue(chunk);
                return;
              }

              if (chunk.text.includes('STOP')) {
                stopStream();

                controller.enqueue({
                  type: 'step-finish',
                  messageId: 'msg-transformed-123',
                  finishReason: 'stop',
                  logprobs: undefined,
                  providerMetadata: undefined,
                  usage: {
                    completionTokens: NaN,
                    promptTokens: NaN,
                    totalTokens: NaN,
                  },
                  request: {},
                  response: {
                    id: 'response-id',
                    modelId: 'mock-model-id',
                    timestamp: new Date(0),
                  },
                  warnings: [],
                  isContinued: false,
                });

                controller.enqueue({
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  providerMetadata: undefined,
                  usage: {
                    completionTokens: NaN,
                    promptTokens: NaN,
                    totalTokens: NaN,
                  },
                  response: {
                    id: 'response-id',
                    modelId: 'mock-model-id',
                    timestamp: new Date(0),
                  },
                });

                return;
              }

              controller.enqueue(chunk);
            },
          });

      it('stream should stop when STOP token is encountered', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: 'Hello, ' },
              { type: 'text', text: 'STOP' },
              { type: 'text', text: ' World' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { inputTokens: undefined, outputTokens: undefined },
              },
            ]),
          }),
          prompt: 'test-input',
          experimental_transform: stopWordTransform(),
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });

        expect(
          await convertAsyncIterableToArray(result.fullStream),
        ).toStrictEqual([
          {
            type: 'step-start',
            messageId: 'msg-0',
            request: {},
            warnings: [],
          },
          { type: 'text', text: 'Hello, ' },
          {
            type: 'step-finish',
            providerMetadata: undefined,
            messageId: 'msg-transformed-123',
            finishReason: 'stop',
            logprobs: undefined,
            usage: {
              completionTokens: NaN,
              promptTokens: NaN,
              totalTokens: NaN,
            },
            request: {},
            response: {
              id: 'response-id',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            warnings: [],
            isContinued: false,
          },
          {
            type: 'finish',
            providerMetadata: undefined,
            finishReason: 'stop',
            logprobs: undefined,
            usage: {
              completionTokens: NaN,
              promptTokens: NaN,
              totalTokens: NaN,
            },
            response: {
              id: 'response-id',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
          },
        ]);
      });

      it('options.onStepFinish should be called', async () => {
        let result!: Parameters<
          Required<Parameters<typeof streamText>[0]>['onStepFinish']
        >[0];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: 'Hello, ' },
              { type: 'text', text: 'STOP' },
              { type: 'text', text: ' World' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { outputTokens: 10, inputTokens: 3 },
              },
            ]),
          }),
          prompt: 'test-input',
          onStepFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
          experimental_transform: stopWordTransform(),
        });

        await resultObject.consumeStream();

        expect(result).toMatchSnapshot();
      });
    });
  });

  describe('options.output', () => {
    describe('no output', () => {
      it('should throw error when accessing partial output stream', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: '{ ' },
              { type: 'text', text: '"value": ' },
              { type: 'text', text: `"Hello, ` },
              { type: 'text', text: `world` },
              { type: 'text', text: `!"` },
              { type: 'text', text: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
          }),
          prompt: 'prompt',
        });

        await expect(async () => {
          await convertAsyncIterableToArray(
            result.experimental_partialOutputStream,
          );
        }).rejects.toThrow('No output specified');
      });
    });

    describe('text output', () => {
      it('should send partial output stream', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: 'Hello, ' },
              { type: 'text', text: ',' },
              { type: 'text', text: ' world!' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
          }),
          experimental_output: text(),
          prompt: 'prompt',
        });

        expect(
          await convertAsyncIterableToArray(
            result.experimental_partialOutputStream,
          ),
        ).toStrictEqual(['Hello, ', 'Hello, ,', 'Hello, , world!']);
      });
    });

    describe('object output', () => {
      it('should set responseFormat to json and send schema as part of the responseFormat', async () => {
        let callOptions!: LanguageModelV2CallOptions;

        const result = streamText({
          model: new MockLanguageModelV2({
            supportsStructuredOutputs: false,
            doStream: async args => {
              callOptions = args;
              return {
                stream: convertArrayToReadableStream([
                  { type: 'text', text: '{ ' },
                  { type: 'text', text: '"value": ' },
                  { type: 'text', text: `"Hello, ` },
                  { type: 'text', text: `world` },
                  { type: 'text', text: `!"` },
                  { type: 'text', text: ' }' },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { inputTokens: 3, outputTokens: 10 },
                  },
                ]),
              };
            },
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
        });

        await result.consumeStream();

        expect(callOptions).toEqual({
          temperature: 0,
          inputFormat: 'prompt',
          responseFormat: { type: 'json', schema: undefined },
          prompt: [
            {
              content:
                'JSON schema:\n' +
                '{"type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}\n' +
                'You MUST answer with a JSON object that matches the JSON schema above.',
              role: 'system',
            },
            {
              content: [{ text: 'prompt', type: 'text' }],
              providerOptions: undefined,
              role: 'user',
            },
          ],
        });
      });

      it('should send valid partial text fragments', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: '{ ' },
              { type: 'text', text: '"value": ' },
              { type: 'text', text: `"Hello, ` },
              { type: 'text', text: `world` },
              { type: 'text', text: `!"` },
              { type: 'text', text: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
        });

        expect(
          await convertAsyncIterableToArray(result.textStream),
        ).toStrictEqual([
          `{ `,
          // key difference: need to combine after `:`
          `"value": "Hello, `,
          `world`,
          `!"`,
          ` }`,
        ]);
      });

      it('should send partial output stream', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: '{ ' },
              { type: 'text', text: '"value": ' },
              { type: 'text', text: `"Hello, ` },
              { type: 'text', text: `world` },
              { type: 'text', text: `!"` },
              { type: 'text', text: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
        });

        expect(
          await convertAsyncIterableToArray(
            result.experimental_partialOutputStream,
          ),
        ).toStrictEqual([
          {},
          { value: 'Hello, ' },
          { value: 'Hello, world' },
          { value: 'Hello, world!' },
        ]);
      });

      it('should send partial output stream when last chunk contains content', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: '{ ' },
              { type: 'text', text: '"value": ' },
              { type: 'text', text: `"Hello, ` },
              { type: 'text', text: `world!" }` },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
        });

        expect(
          await convertAsyncIterableToArray(
            result.experimental_partialOutputStream,
          ),
        ).toStrictEqual([{}, { value: 'Hello, ' }, { value: 'Hello, world!' }]);
      });

      it('should resolve text promise with the correct content', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: '{ ' },
              { type: 'text', text: '"value": ' },
              { type: 'text', text: `"Hello, ` },
              { type: 'text', text: `world!" ` },
              { type: 'text', text: '}' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
        });

        result.consumeStream();

        expect(await result.text).toStrictEqual('{ "value": "Hello, world!" }');
      });

      it('should call onFinish with the correct content', async () => {
        let result!: Parameters<
          Required<Parameters<typeof streamText>[0]>['onFinish']
        >[0];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text', text: '{ ' },
              { type: 'text', text: '"value": ' },
              { type: 'text', text: `"Hello, ` },
              { type: 'text', text: `world!" ` },
              { type: 'text', text: '}' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 3, outputTokens: 10 },
              },
            ]),
          }),
          experimental_output: object({
            schema: z.object({ value: z.string() }),
          }),
          prompt: 'prompt',
          onFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
          _internal: {
            generateId: mockId({ prefix: 'id' }),
            currentDate: () => new Date(0),
          },
        });

        resultObject.consumeStream();

        await resultObject.consumeStream();

        expect(result).toMatchSnapshot();
      });
    });
  });
});
