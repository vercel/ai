import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
  convertResponseStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { jsonSchema } from '@ai-sdk/ui-utils';
import assert from 'node:assert';
import { z } from 'zod';
import { ToolExecutionError } from '../../errors/tool-execution-error';
import { StreamData } from '../../streams/stream-data';
import { delay } from '../../util/delay';
import { createDataStream } from '../data-stream/create-data-stream';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { createMockServerResponse } from '../test/mock-server-response';
import { MockTracer } from '../test/mock-tracer';
import { mockValues } from '../test/mock-values';
import { CoreTool, tool } from '../tool/tool';
import { StepResult } from './step-result';
import { streamText } from './stream-text';
import { StreamTextResult, TextStreamPart } from './stream-text-result';

function createTestModel({
  stream = convertArrayToReadableStream([
    {
      type: 'response-metadata',
      id: 'id-0',
      modelId: 'mock-model-id',
      timestamp: new Date(0),
    },
    { type: 'text-delta', textDelta: 'Hello' },
    { type: 'text-delta', textDelta: ', ' },
    { type: 'text-delta', textDelta: `world!` },
    {
      type: 'finish',
      finishReason: 'stop',
      logprobs: undefined,
      usage: { completionTokens: 10, promptTokens: 3 },
    },
  ]),
  rawCall = { rawPrompt: 'prompt', rawSettings: {} },
  rawResponse = undefined,
  request = undefined,
  warnings,
}: {
  stream?: ReadableStream<LanguageModelV1StreamPart>;
  rawResponse?: { headers: Record<string, string> };
  rawCall?: { rawPrompt: string; rawSettings: Record<string, unknown> };
  request?: { body: string };
  warnings?: LanguageModelV1CallWarning[];
} = {}): LanguageModelV1 {
  return new MockLanguageModelV1({
    doStream: async () => ({
      stream,
      rawCall,
      rawResponse,
      request,
      warnings,
    }),
  });
}

describe('streamText', () => {
  describe('result.textStream', () => {
    it('should send text deltas', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: undefined,
              toolChoice: undefined,
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
                { type: 'text-delta', textDelta: ', ' },
                { type: 'text-delta', textDelta: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
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
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: 'world!' },
            { type: 'text-delta', textDelta: '' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      assert.deepStrictEqual(
        await convertAsyncIterableToArray(result.textStream),
        ['Hello', ', ', 'world!'],
      );
    });

    it('should re-throw error in doStream', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
      });

      await expect(async () => {
        await convertAsyncIterableToArray(result.textStream);
      }).rejects.toThrow('test error');
    });
  });

  describe('result.fullStream', () => {
    it('should send text deltas', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: undefined,
              toolChoice: undefined,
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
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
                { type: 'text-delta', textDelta: 'Hello' },
                { type: 'text-delta', textDelta: ', ' },
                { type: 'text-delta', textDelta: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should use fallback response metadata when response metadata is not provided', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: undefined,
              toolChoice: undefined,
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
                { type: 'text-delta', textDelta: ', ' },
                { type: 'text-delta', textDelta: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        prompt: 'test-input',
        _internal: {
          currentDate: mockValues(new Date(2000)),
          generateId: mockValues('id-2000'),
        },
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send tool calls', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: [
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
              ],
              toolChoice: { type: 'required' },
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
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
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
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
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should not send tool call deltas when toolCallStreaming is disabled', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: [
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
              ],
              toolChoice: { type: 'required' },
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
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
                  usage: { promptTokens: 53, completionTokens: 17 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
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
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send tool call deltas when toolCallStreaming is enabled', async () => {
      const result = streamText({
        experimental_toolCallStreaming: true,
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
              usage: { promptTokens: 53, completionTokens: 17 },
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
              usage: { completionTokens: 10, promptTokens: 3 },
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
              usage: { completionTokens: 10, promptTokens: 3 },
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
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: 'world!' },
            { type: 'text-delta', textDelta: '' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should forward error in doStream as error stream part', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
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
            { type: 'text-delta', textDelta: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      result.pipeDataStreamToResponse(mockResponse, { sendUsage: false });

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });
  });

  describe('result.pipeTextStreamToResponse', async () => {
    it('should write text deltas to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: 'world!' },
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
        prompt: 'test-input',
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
        prompt: 'test-input',
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
              usage: { completionTokens: 10, promptTokens: 3 },
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
              usage: { completionTokens: 10, promptTokens: 3 },
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
        experimental_toolCallStreaming: true,
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
        prompt: 'test-input',
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
        prompt: 'test-input',
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
            { type: 'text-delta', textDelta: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      const dataStream = result.toDataStream({ sendUsage: false });

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
            { type: 'text-delta', textDelta: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
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
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: 'world!' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
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

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

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
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

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
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

      expect(await result.finishReason).toStrictEqual('stop');
    });
  });

  describe('result.providerMetadata', () => {
    it('should resolve with provider metadata', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

      expect(await result.experimental_providerMetadata).toStrictEqual({
        testProvider: { testKey: 'testValue' },
      });
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
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
          request: { body: 'test body' },
        }),
        prompt: 'test-input',
      });

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

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
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
          rawResponse: { headers: { call: '2' } },
        }),
        prompt: 'test-input',
      });

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

      expect(await result.response).toMatchSnapshot();
    });
  });

  describe('result.text', () => {
    it('should resolve with full text', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
      });

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

      assert.strictEqual(await result.text, 'Hello, world!');
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
              usage: { completionTokens: 10, promptTokens: 3 },
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

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

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
              usage: { completionTokens: 10, promptTokens: 3 },
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

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

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
            | 'text-delta'
            | 'tool-call'
            | 'tool-call-streaming-start'
            | 'tool-call-delta'
            | 'tool-result';
        }
      >
    >;

    beforeEach(async () => {
      result = [];

      const { textStream } = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
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
            { type: 'text-delta', textDelta: ' World' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
              },
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
        experimental_toolCallStreaming: true,
        onChunk(event) {
          result.push(event.chunk);
        },
      });

      // consume stream
      await convertAsyncIterableToArray(textStream);
    });

    it('should return events in order', async () => {
      assert.deepStrictEqual(result, [
        { type: 'text-delta', textDelta: 'Hello' },
        {
          type: 'tool-call-streaming-start',
          toolCallId: '1',
          toolName: 'tool1',
        },
        {
          type: 'tool-call-delta',
          argsTextDelta: '{"value": "',
          toolCallId: '1',
          toolName: 'tool1',
        },
        {
          type: 'tool-call-delta',
          argsTextDelta: 'test',
          toolCallId: '1',
          toolName: 'tool1',
        },
        {
          type: 'tool-call-delta',
          argsTextDelta: '"}',
          toolCallId: '1',
          toolName: 'tool1',
        },
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'tool1',
          args: { value: 'test' },
        },
        {
          type: 'tool-result',
          toolCallId: '1',
          toolName: 'tool1',
          args: { value: 'test' },
          result: 'test-result',
        },
        { type: 'text-delta', textDelta: ' World' },
      ]);
    });
  });

  describe('options.onFinish', () => {
    it('options.onFinish should send correct information', async () => {
      let result!: Parameters<
        Required<Parameters<typeof streamText>[0]>['onFinish']
      >[0];

      const { textStream } = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            { type: 'text-delta', textDelta: `world!` },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
          rawResponse: { headers: { call: '2' } },
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
      });

      await convertAsyncIterableToArray(textStream); // consume stream

      expect(result).toMatchSnapshot();
    });
  });

  describe('result.responseMessages', () => {
    it('should contain assistant response message when there are no tool calls', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, ' },
            { type: 'text-delta', textDelta: 'world!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      await convertAsyncIterableToArray(result.textStream); // consume stream

      expect((await result.response).messages).toMatchSnapshot();
    });

    it('should contain assistant response message and tool message when there are tool calls with results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, ' },
            { type: 'text-delta', textDelta: 'world!' },
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
              usage: { promptTokens: 3, completionTokens: 10 },
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
      });

      await convertAsyncIterableToArray(result.textStream); // consume stream

      expect((await result.response).messages).toMatchSnapshot();
    });
  });

  describe('options.maxSteps', () => {
    let result: StreamTextResult<any>;
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
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              switch (responseCount++) {
                case 0: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    tools: [
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
                    ],
                    toolChoice: { type: 'auto' },
                  });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
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
                        finishReason: 'tool-calls',
                        logprobs: undefined,
                        usage: { completionTokens: 10, promptTokens: 3 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '1' } },
                  };
                }
                case 1: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    tools: [
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
                    ],
                    toolChoice: { type: 'auto' },
                  });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'tool-call',
                          toolCallId: 'call-1',
                          toolName: 'tool1',
                          args: { value: 'value' },
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
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
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
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
                      { type: 'text-delta', textDelta: 'Hello, ' },
                      { type: 'text-delta', textDelta: `world!` },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        logprobs: undefined,
                        usage: { completionTokens: 5, promptTokens: 1 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '2' } },
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
        });
      });

      it('should contain assistant response message and tool message from all steps', async () => {
        expect(
          await convertAsyncIterableToArray(result.fullStream),
        ).toMatchSnapshot();
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await convertAsyncIterableToArray(result.fullStream); // consume stream
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
          await convertAsyncIterableToArray(result.fullStream); // consume stream
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
        await convertAsyncIterableToArray(result.fullStream); // consume stream
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
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              switch (responseCount++) {
                case 0: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });
                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
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
                      { type: 'text-delta', textDelta: 'pa' },
                      { type: 'text-delta', textDelta: 'rt ' },
                      { type: 'text-delta', textDelta: '1 \n' },
                      { type: 'text-delta', textDelta: ' to-be' },
                      { type: 'text-delta', textDelta: '-discar' },
                      { type: 'text-delta', textDelta: 'ded' },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { completionTokens: 20, promptTokens: 10 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                  };
                }
                case 1: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });
                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
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
                      { type: 'text-delta', textDelta: 'no-' },
                      { type: 'text-delta', textDelta: 'whitespace' },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { completionTokens: 5, promptTokens: 30 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                  };
                }
                case 2: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerMetadata: undefined,
                        },
                        {
                          type: 'text',
                          text: 'no-whitespace',
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
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
                      // set up trailing whitespace for next step:
                      { type: 'text-delta', textDelta: 'immediatefollow  ' },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { completionTokens: 2, promptTokens: 3 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '3' } },
                  };
                }
                case 3: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerMetadata: undefined,
                        },
                        {
                          type: 'text',
                          text: 'no-whitespace',
                          providerMetadata: undefined,
                        },
                        {
                          type: 'text',
                          text: 'immediatefollow  ',
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
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
                      { type: 'text-delta', textDelta: ' ' }, // split into 2 chunks for test coverage
                      { type: 'text-delta', textDelta: '  final' },
                      { type: 'text-delta', textDelta: ' va' },
                      { type: 'text-delta', textDelta: 'lue keep all w' },
                      { type: 'text-delta', textDelta: 'hitespace' },
                      { type: 'text-delta', textDelta: '\n ' },
                      { type: 'text-delta', textDelta: 'en' },
                      { type: 'text-delta', textDelta: 'd' },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        logprobs: undefined,
                        usage: { completionTokens: 2, promptTokens: 3 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '3' } },
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
        });
      });

      it('should contain text deltas from all steps', async () => {
        expect(
          await convertAsyncIterableToArray(result.fullStream),
        ).toMatchSnapshot();
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await convertAsyncIterableToArray(result.fullStream); // consume stream
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
          await convertAsyncIterableToArray(result.fullStream); // consume stream
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
              content: [
                {
                  type: 'text',
                  text: 'part 1 \n no-whitespaceimmediatefollow  final value keep all whitespace\n end',
                },
              ],
              role: 'assistant',
            },
          ]);
        });
      });

      it('should record telemetry data for each step', async () => {
        await convertAsyncIterableToArray(result.fullStream); // consume stream
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
    });
  });

  describe('options.headers', () => {
    it('should set headers', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ headers }) => {
            expect(headers).toStrictEqual({
              'custom-request-header': 'request-header-value',
            });

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
                { type: 'text-delta', textDelta: ', ' },
                { type: 'text-delta', textDelta: `world!` },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
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
        model: new MockLanguageModelV1({
          doStream: async ({ providerMetadata }) => {
            expect(providerMetadata).toStrictEqual({
              aProvider: { someKey: 'someValue' },
            });

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'provider metadata test' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        prompt: 'test-input',
        experimental_providerMetadata: {
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
              usage: { promptTokens: 10, completionTokens: 20 },
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

      // consume stream
      await convertAsyncIterableToArray(result.textStream);

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

      // consume stream
      await convertAsyncIterableToArray(result.textStream);

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
              usage: { completionTokens: 20, promptTokens: 10 },
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

      // consume stream
      await convertAsyncIterableToArray(result.textStream);

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
              usage: { completionTokens: 20, promptTokens: 10 },
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

      // consume stream
      await convertAsyncIterableToArray(result.textStream);

      expect(tracer.jsonSpans).toMatchSnapshot();
    });
  });

  describe('tools with custom schema', () => {
    it('should send tool calls', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: [
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
              ],
              toolChoice: { type: 'required' },
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerMetadata: undefined,
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
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
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
        model: new MockLanguageModelV1({
          doStream: async ({ prompt }) => {
            expect(prompt).toStrictEqual([
              {
                content: [
                  {
                    text: 'prompt',
                    type: 'text',
                  },
                ],
                providerMetadata: undefined,
                role: 'user',
              },
              {
                content: [
                  {
                    args: {
                      value: 'test-value',
                    },
                    providerMetadata: undefined,
                    toolCallId: 'call-1',
                    toolName: 'test-tool',
                    type: 'tool-call',
                  },
                ],
                providerMetadata: undefined,
                role: 'assistant',
              },
              {
                content: [
                  {
                    content: undefined,
                    isError: undefined,
                    providerMetadata: undefined,
                    result: 'test result',
                    toolCallId: 'call-1',
                    toolName: 'test-tool',
                    type: 'tool-result',
                  },
                ],
                providerMetadata: undefined,
                role: 'tool',
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
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
              usage: { completionTokens: 10, promptTokens: 3 },
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
            toolArgs: { value: 'value' },
            cause: new Error('test error'),
          }),
        },
        {
          type: 'step-finish',
          experimental_providerMetadata: undefined,
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
          experimental_providerMetadata: undefined,
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
    const upperCaseTransform =
      <TOOLS extends Record<string, CoreTool>>() =>
      (options: { tools: TOOLS }) =>
        new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
          transform(chunk, controller) {
            if (chunk.type === 'text-delta') {
              chunk.textDelta = chunk.textDelta.toUpperCase();
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
            }

            if (chunk.type === 'step-finish') {
              if (chunk.request.body != null) {
                chunk.request.body = chunk.request.body.toUpperCase();
              }
            }

            if (chunk.type === 'finish') {
              if (chunk.experimental_providerMetadata?.testProvider != null) {
                chunk.experimental_providerMetadata.testProvider = {
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
        experimental_transform: upperCaseTransform(),
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.textStream),
      ).toStrictEqual(['HELLO', ', ', 'WORLD!']);
    });

    it('result.text should be transformed', async () => {
      const result = streamText({
        model: createTestModel(),
        experimental_transform: upperCaseTransform(),
        prompt: 'test-input',
      });

      // consume stream
      await convertAsyncIterableToArray(result.fullStream);

      expect(await result.text).toStrictEqual('HELLO, WORLD!');
    });

    it('result.response.messages should be transformed', async () => {
      const result = streamText({
        model: createTestModel(),
        experimental_transform: upperCaseTransform(),
        prompt: 'test-input',
      });

      // consume stream
      await convertAsyncIterableToArray(result.fullStream);

      expect(await result.response).toStrictEqual({
        id: expect.any(String),
        timestamp: expect.any(Date),
        modelId: expect.any(String),
        headers: undefined,
        messages: [
          {
            content: [
              {
                text: 'HELLO, WORLD!',
                type: 'text',
              },
            ],
            role: 'assistant',
          },
        ],
      });
    });

    it('result.usage should be transformed', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 20, promptTokens: 5 },
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

      // consume stream
      await convertAsyncIterableToArray(result.fullStream);

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
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'length',
              logprobs: undefined,
              usage: { completionTokens: 20, promptTokens: 5 },
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

      // consume stream
      await convertAsyncIterableToArray(result.fullStream);

      expect(await result.finishReason).toStrictEqual('stop');
    });

    it('result.toolCalls should be transformed', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, ' },
            { type: 'text-delta', textDelta: 'world!' },
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
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
        },
        experimental_transform: upperCaseTransform(),
        prompt: 'test-input',
      });

      // consume stream
      await convertAsyncIterableToArray(result.fullStream);

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
            { type: 'text-delta', textDelta: 'Hello, ' },
            { type: 'text-delta', textDelta: 'world!' },
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
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
        },
        experimental_transform: upperCaseTransform(),
        prompt: 'test-input',
      });

      // consume stream
      await convertAsyncIterableToArray(result.fullStream);

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
            { type: 'text-delta', textDelta: 'Hello, ' },
            { type: 'text-delta', textDelta: 'world!' },
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
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
        },
        experimental_transform: upperCaseTransform(),
        prompt: 'test-input',
      });

      // consume stream
      await convertAsyncIterableToArray(result.fullStream);

      expect(await result.steps).toStrictEqual([
        {
          stepType: 'initial',
          text: 'HELLO, WORLD!',
          experimental_providerMetadata: undefined,
          finishReason: 'stop',
          isContinued: false,
          logprobs: undefined,
          request: {},
          response: {
            headers: undefined,
            id: 'id-0',
            messages: [
              {
                content: [
                  {
                    text: 'HELLO, WORLD!',
                    type: 'text',
                  },
                  {
                    args: {
                      value: 'VALUE',
                    },
                    toolCallId: 'call-1',
                    toolName: 'tool1',
                    type: 'tool-call',
                  },
                ],
                role: 'assistant',
              },
              {
                content: [
                  {
                    result: 'RESULT1',
                    toolCallId: 'call-1',
                    toolName: 'tool1',
                    type: 'tool-result',
                  },
                ],
                role: 'tool',
              },
            ],
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          toolCalls: [
            {
              args: {
                value: 'VALUE',
              },
              toolCallId: 'call-1',
              toolName: 'tool1',
              type: 'tool-call',
            },
          ],
          toolResults: [
            {
              args: {
                value: 'VALUE',
              },
              result: 'RESULT1',
              toolCallId: 'call-1',
              toolName: 'tool1',
              type: 'tool-result',
            },
          ],
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
          warnings: undefined,
        },
      ]);
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
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
          request: { body: 'test body' },
        }),
        prompt: 'test-input',
        experimental_transform: upperCaseTransform(),
      });

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

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
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
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
        experimental_transform: upperCaseTransform(),
      });

      // consume stream (runs in parallel)
      convertAsyncIterableToArray(result.textStream);

      expect(
        JSON.stringify(await result.experimental_providerMetadata),
      ).toStrictEqual(
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

      const { textStream } = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            { type: 'text-delta', textDelta: `world!` },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
          rawResponse: { headers: { call: '2' } },
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
        experimental_transform: upperCaseTransform(),
      });

      await convertAsyncIterableToArray(textStream); // consume stream

      expect(result).toMatchSnapshot();
    });

    it('options.onStepFinish should receive transformed data', async () => {
      let result!: Parameters<
        Required<Parameters<typeof streamText>[0]>['onStepFinish']
      >[0];

      const { textStream } = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            { type: 'text-delta', textDelta: `world!` },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
          rawResponse: { headers: { call: '2' } },
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
        experimental_transform: upperCaseTransform(),
      });

      await convertAsyncIterableToArray(textStream); // consume stream

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
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            { type: 'text-delta', textDelta: `world!` },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
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
        experimental_transform: upperCaseTransform(),
        experimental_telemetry: { isEnabled: true, tracer },
        _internal: { now: mockValues(0, 100, 500) },
      });

      // consume stream
      await convertAsyncIterableToArray(result.textStream);

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('it should send transform chunks to onChunk', async () => {
      const result: Array<
        Extract<
          TextStreamPart<any>,
          {
            type:
              | 'text-delta'
              | 'tool-call'
              | 'tool-call-streaming-start'
              | 'tool-call-delta'
              | 'tool-result';
          }
        >
      > = [];

      const { textStream } = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
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
            { type: 'text-delta', textDelta: ' World' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
              },
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
        experimental_toolCallStreaming: true,
        onChunk(event) {
          result.push(event.chunk);
        },
        experimental_transform: upperCaseTransform(),
      });

      // consume stream
      await convertAsyncIterableToArray(textStream);

      assert.deepStrictEqual(result, [
        { type: 'text-delta', textDelta: 'HELLO' },
        {
          type: 'tool-call-streaming-start',
          toolCallId: '1',
          toolName: 'tool1',
        },
        {
          type: 'tool-call-delta',
          argsTextDelta: '{"VALUE": "',
          toolCallId: '1',
          toolName: 'tool1',
        },
        {
          type: 'tool-call-delta',
          argsTextDelta: 'TEST',
          toolCallId: '1',
          toolName: 'tool1',
        },
        {
          type: 'tool-call-delta',
          argsTextDelta: '"}',
          toolCallId: '1',
          toolName: 'tool1',
        },
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'tool1',
          args: { value: 'TEST' },
        },
        {
          type: 'tool-result',
          toolCallId: '1',
          toolName: 'tool1',
          args: { value: 'TEST' },
          result: 'TEST-RESULT',
        },
        { type: 'text-delta', textDelta: ' WORLD' },
      ]);
    });
  });
});
