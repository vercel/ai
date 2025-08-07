import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2FunctionTool,
  LanguageModelV2ProviderDefinedTool,
  LanguageModelV2StreamPart,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider';
import {
  delay,
  dynamicTool,
  jsonSchema,
  ModelMessage,
  tool,
  Tool,
} from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
  convertResponseStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import assert from 'node:assert';
import { z } from 'zod/v4';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { createMockServerResponse } from '../test/mock-server-response';
import { MockTracer } from '../test/mock-tracer';
import { mockValues } from '../test/mock-values';
import { object, text } from './output';
import { StepResult } from './step-result';
import { stepCountIs } from './stop-condition';
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
    onError: () => {},
  }) as const;

const testUsage = {
  inputTokens: 3,
  outputTokens: 10,
  totalTokens: 13,
  reasoningTokens: undefined,
  cachedInputTokens: undefined,
};

const testUsage2 = {
  inputTokens: 3,
  outputTokens: 10,
  totalTokens: 23,
  reasoningTokens: 10,
  cachedInputTokens: 3,
};

function createTestModel({
  warnings = [],
  stream = convertArrayToReadableStream([
    {
      type: 'stream-start',
      warnings,
    },
    {
      type: 'response-metadata',
      id: 'id-0',
      modelId: 'mock-model-id',
      timestamp: new Date(0),
    },
    { type: 'text-start', id: '1' },
    { type: 'text-delta', id: '1', delta: 'Hello' },
    { type: 'text-delta', id: '1', delta: ', ' },
    { type: 'text-delta', id: '1', delta: `world!` },
    { type: 'text-end', id: '1' },
    {
      type: 'finish',
      finishReason: 'stop',
      usage: testUsage,
      providerMetadata: {
        testProvider: { testKey: 'testValue' },
      },
    },
  ]),
  request = undefined,
  response = undefined,
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
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: 'Hello!' },
      { type: 'text-end', id: '1' },
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
        usage: testUsage,
      },
    ]),
  }),
});

const modelWithDocumentSources = new MockLanguageModelV2({
  doStream: async () => ({
    stream: convertArrayToReadableStream([
      {
        type: 'source',
        sourceType: 'document',
        id: 'doc-123',
        mediaType: 'application/pdf',
        title: 'Document Example',
        filename: 'example.pdf',
        providerMetadata: { provider: { custom: 'doc-value' } },
      },
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: 'Hello from document!' },
      { type: 'text-end', id: '1' },
      {
        type: 'source',
        sourceType: 'document',
        id: 'doc-456',
        mediaType: 'text/plain',
        title: 'Text Document',
        providerMetadata: { provider: { custom: 'doc-value2' } },
      },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: testUsage,
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
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: 'Hello!' },
      { type: 'text-end', id: '1' },
      {
        type: 'file',
        data: 'QkFVRw==',
        mediaType: 'image/jpeg',
      },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: testUsage,
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
      { type: 'reasoning-start', id: '1' },
      {
        type: 'reasoning-delta',
        id: '1',
        delta: 'I will open the conversation',
      },
      {
        type: 'reasoning-delta',
        id: '1',
        delta: ' with witty banter.',
      },
      {
        type: 'reasoning-delta',
        id: '1',
        delta: '',
        providerMetadata: {
          testProvider: { signature: '1234567890' },
        } as SharedV2ProviderMetadata,
      },
      { type: 'reasoning-end', id: '1' },
      {
        type: 'reasoning-start',
        id: '2',
        providerMetadata: {
          testProvider: { redactedData: 'redacted-reasoning-data' },
        },
      },
      { type: 'reasoning-end', id: '2' },
      { type: 'reasoning-start', id: '3' },
      {
        type: 'reasoning-delta',
        id: '3',
        delta: ' Once the user has relaxed,',
      },
      {
        type: 'reasoning-delta',
        id: '3',
        delta: ' I will pry for valuable information.',
      },
      {
        type: 'reasoning-end',
        id: '3',
        providerMetadata: {
          testProvider: { signature: '1234567890' },
        } as SharedV2ProviderMetadata,
      },
      {
        type: 'reasoning-start',
        id: '4',
        providerMetadata: {
          testProvider: { signature: '1234567890' },
        } as SharedV2ProviderMetadata,
      },
      {
        type: 'reasoning-delta',
        id: '4',
        delta: ' I need to think about',
      },
      {
        type: 'reasoning-delta',
        id: '4',
        delta: ' this problem carefully.',
      },
      {
        type: 'reasoning-start',
        id: '5',
        providerMetadata: {
          testProvider: { signature: '1234567890' },
        } as SharedV2ProviderMetadata,
      },
      {
        type: 'reasoning-delta',
        id: '5',
        delta: ' The best solution',
      },
      {
        type: 'reasoning-delta',
        id: '5',
        delta: ' requires careful',
      },
      {
        type: 'reasoning-delta',
        id: '5',
        delta: ' consideration of all factors.',
      },
      {
        type: 'reasoning-end',
        id: '4',
        providerMetadata: {
          testProvider: { signature: '0987654321' },
        } as SharedV2ProviderMetadata,
      },
      {
        type: 'reasoning-end',
        id: '5',
        providerMetadata: {
          testProvider: { signature: '0987654321' },
        } as SharedV2ProviderMetadata,
      },
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: 'Hi' },
      { type: 'text-delta', id: '1', delta: ' there!' },
      { type: 'text-end', id: '1' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: testUsage,
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
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
                { type: 'text-delta', id: '1', delta: ', ' },
                { type: 'text-delta', id: '1', delta: `world!` },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
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
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: '' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-delta', id: '1', delta: '' },
            { type: 'text-delta', id: '1', delta: ', ' },
            { type: 'text-delta', id: '1', delta: '' },
            { type: 'text-delta', id: '1', delta: 'world!' },
            { type: 'text-delta', id: '1', delta: '' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
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
        onError: () => {},
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
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
                { type: 'text-delta', id: '1', delta: ', ' },
                { type: 'text-delta', id: '1', delta: `world!` },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
                },
              ]),
            };
          },
        }),
        prompt: 'test-input',
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "Hello",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": ", ",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "world!",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "response-id",
                "modelId": "response-model-id",
                "timestamp": 1970-01-01T00:00:05.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
            },
            {
              "finishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "type": "finish",
            },
          ]
        `);
    });

    it('should send reasoning deltas', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "1",
              "type": "reasoning-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "I will open the conversation",
              "type": "reasoning-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": " with witty banter.",
              "type": "reasoning-delta",
            },
            {
              "id": "1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "1234567890",
                },
              },
              "text": "",
              "type": "reasoning-delta",
            },
            {
              "id": "1",
              "type": "reasoning-end",
            },
            {
              "id": "2",
              "providerMetadata": {
                "testProvider": {
                  "redactedData": "redacted-reasoning-data",
                },
              },
              "type": "reasoning-start",
            },
            {
              "id": "2",
              "type": "reasoning-end",
            },
            {
              "id": "3",
              "type": "reasoning-start",
            },
            {
              "id": "3",
              "providerMetadata": undefined,
              "text": " Once the user has relaxed,",
              "type": "reasoning-delta",
            },
            {
              "id": "3",
              "providerMetadata": undefined,
              "text": " I will pry for valuable information.",
              "type": "reasoning-delta",
            },
            {
              "id": "3",
              "providerMetadata": {
                "testProvider": {
                  "signature": "1234567890",
                },
              },
              "type": "reasoning-end",
            },
            {
              "id": "4",
              "providerMetadata": {
                "testProvider": {
                  "signature": "1234567890",
                },
              },
              "type": "reasoning-start",
            },
            {
              "id": "4",
              "providerMetadata": undefined,
              "text": " I need to think about",
              "type": "reasoning-delta",
            },
            {
              "id": "4",
              "providerMetadata": undefined,
              "text": " this problem carefully.",
              "type": "reasoning-delta",
            },
            {
              "id": "5",
              "providerMetadata": {
                "testProvider": {
                  "signature": "1234567890",
                },
              },
              "type": "reasoning-start",
            },
            {
              "id": "5",
              "providerMetadata": undefined,
              "text": " The best solution",
              "type": "reasoning-delta",
            },
            {
              "id": "5",
              "providerMetadata": undefined,
              "text": " requires careful",
              "type": "reasoning-delta",
            },
            {
              "id": "5",
              "providerMetadata": undefined,
              "text": " consideration of all factors.",
              "type": "reasoning-delta",
            },
            {
              "id": "4",
              "providerMetadata": {
                "testProvider": {
                  "signature": "0987654321",
                },
              },
              "type": "reasoning-end",
            },
            {
              "id": "5",
              "providerMetadata": {
                "testProvider": {
                  "signature": "0987654321",
                },
              },
              "type": "reasoning-end",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "Hi",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": " there!",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
            },
            {
              "finishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "type": "finish",
            },
          ]
        `);
    });

    it('should send sources', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "123",
              "providerMetadata": {
                "provider": {
                  "custom": "value",
                },
              },
              "sourceType": "url",
              "title": "Example",
              "type": "source",
              "url": "https://example.com",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "Hello!",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "id": "456",
              "providerMetadata": {
                "provider": {
                  "custom": "value2",
                },
              },
              "sourceType": "url",
              "title": "Example 2",
              "type": "source",
              "url": "https://example.com/2",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
            },
            {
              "finishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "type": "finish",
            },
          ]
        `);
    });

    it('should send files', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "file": DefaultGeneratedFileWithType {
                "base64Data": "Hello World",
                "mediaType": "text/plain",
                "type": "file",
                "uint8ArrayData": undefined,
              },
              "type": "file",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "Hello!",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "file": DefaultGeneratedFileWithType {
                "base64Data": "QkFVRw==",
                "mediaType": "image/jpeg",
                "type": "file",
                "uint8ArrayData": undefined,
              },
              "type": "file",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
            },
            {
              "finishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "type": "finish",
            },
          ]
        `);
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
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
                { type: 'text-delta', id: '1', delta: ', ' },
                { type: 'text-delta', id: '1', delta: `world!` },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
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
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "Hello",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": ", ",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "world!",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-2000",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:02.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
            },
            {
              "finishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "type": "finish",
            },
          ]
        `);
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
                inputSchema: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
                providerOptions: undefined,
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
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: `{ "value": "value" }`,
                  providerMetadata: {
                    testProvider: {
                      signature: 'sig',
                    },
                  },
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
                },
              ]),
            };
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
          }),
        },
        toolChoice: 'required',
        prompt: 'test-input',
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toMatchSnapshot();
    });

    it('should send tool call deltas', async () => {
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
              type: 'tool-input-start',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolName: 'test-tool',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: '{"',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: 'value',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: '":"',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: 'Spark',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: 'le',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: ' Day',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: '"}',
            },
            {
              type: 'tool-input-end',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
            },
            {
              type: 'tool-call',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolName: 'test-tool',
              input: '{"value":"Sparkle Day"}',
            },
            {
              type: 'finish',
              finishReason: 'tool-calls',
              usage: testUsage2,
            },
          ]),
        }),
        tools: {
          'test-tool': tool({
            inputSchema: z.object({ value: z.string() }),
          }),
        },
        toolChoice: 'required',
        prompt: 'test-input',
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "dynamic": false,
              "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
              "toolName": "test-tool",
              "type": "tool-input-start",
            },
            {
              "delta": "{"",
              "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
              "type": "tool-input-delta",
            },
            {
              "delta": "value",
              "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
              "type": "tool-input-delta",
            },
            {
              "delta": "":"",
              "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
              "type": "tool-input-delta",
            },
            {
              "delta": "Spark",
              "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
              "type": "tool-input-delta",
            },
            {
              "delta": "le",
              "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
              "type": "tool-input-delta",
            },
            {
              "delta": " Day",
              "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
              "type": "tool-input-delta",
            },
            {
              "delta": ""}",
              "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
              "type": "tool-input-delta",
            },
            {
              "id": "call_O17Uplv4lJvD6DVdIvFFeRMw",
              "type": "tool-input-end",
            },
            {
              "input": {
                "value": "Sparkle Day",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
              "toolName": "test-tool",
              "type": "tool-call",
            },
            {
              "finishReason": "tool-calls",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": 3,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": 10,
                "totalTokens": 23,
              },
            },
            {
              "finishReason": "tool-calls",
              "totalUsage": {
                "cachedInputTokens": 3,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": 10,
                "totalTokens": 23,
              },
              "type": "finish",
            },
          ]
        `);
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
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async (input, options) => {
              expect(input).toStrictEqual({ value: 'value' });
              expect(options.messages).toStrictEqual([
                { role: 'user', content: 'test-input' },
              ]);
              return `${input.value}-result`;
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
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
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
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: '' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-delta', id: '1', delta: '' },
            { type: 'text-delta', id: '1', delta: ', ' },
            { type: 'text-delta', id: '1', delta: '' },
            { type: 'text-delta', id: '1', delta: 'world!' },
            { type: 'text-delta', id: '1', delta: '' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        prompt: 'test-input',
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "Hello",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": ", ",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "world!",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
            },
            {
              "finishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "type": "finish",
            },
          ]
        `);
    });
  });

  describe('errors', () => {
    it('should forward error in doStream as error stream part', async () => {
      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
        onError: () => {},
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          type: 'start',
        },
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
    });

    it('should invoke onError callback when error is thrown', async () => {
      const onError = vi.fn();

      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
        onError,
      });

      await result.consumeStream();

      expect(onError).toHaveBeenCalledWith({
        error: new Error('test error'),
      });
    });

    it('should invoke onError callback when error is thrown in 2nd step', async () => {
      const onError = vi.fn();
      let responseCount = 0;

      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ prompt, tools, toolChoice }) => {
            if (responseCount++ === 0) {
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
                    toolCallId: 'call-1',
                    toolName: 'tool1',
                    input: `{ "value": "value" }`,
                  },
                  {
                    type: 'finish',
                    finishReason: 'tool-calls',
                    usage: testUsage,
                  },
                ]),
                response: { headers: { call: '1' } },
              };
            }

            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
        },
        stopWhen: stepCountIs(3),
        onError,
      });

      await result.consumeStream();

      expect(onError).toHaveBeenCalledWith({
        error: new Error('test error'),
      });
    });
  });

  describe('result.pipeUIMessageStreamToResponse', async () => {
    it('should write data stream parts to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        _internal: {
          generateId: mockId({ prefix: 'id' }),
        },
      });

      result.pipeUIMessageStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toMatchInlineSnapshot(`
        {
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "content-type": "text/event-stream",
          "x-accel-buffering": "no",
          "x-vercel-ai-ui-message-stream": "v1",
        }
      `);
      expect(mockResponse.getDecodedChunks()).toMatchInlineSnapshot(`
        [
          "data: {"type":"start"}

        ",
          "data: {"type":"start-step"}

        ",
          "data: {"type":"text-start","id":"1"}

        ",
          "data: {"type":"text-delta","id":"1","delta":"Hello"}

        ",
          "data: {"type":"text-delta","id":"1","delta":", "}

        ",
          "data: {"type":"text-delta","id":"1","delta":"world!"}

        ",
          "data: {"type":"text-end","id":"1"}

        ",
          "data: {"type":"finish-step"}

        ",
          "data: {"type":"finish"}

        ",
          "data: [DONE]

        ",
        ]
      `);
    });

    it('should create a Response with a data stream and custom headers', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        _internal: {
          generateId: mockId({ prefix: 'id' }),
        },
      });

      result.pipeUIMessageStreamToResponse(mockResponse, {
        status: 201,
        statusText: 'foo',
        headers: {
          'custom-header': 'custom-value',
        },
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(201);
      expect(mockResponse.statusMessage).toBe('foo');

      expect(mockResponse.headers).toMatchInlineSnapshot(`
        {
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "content-type": "text/event-stream",
          "custom-header": "custom-value",
          "x-accel-buffering": "no",
          "x-vercel-ai-ui-message-stream": "v1",
        }
      `);

      expect(mockResponse.getDecodedChunks()).toMatchInlineSnapshot(`
        [
          "data: {"type":"start"}

        ",
          "data: {"type":"start-step"}

        ",
          "data: {"type":"text-start","id":"1"}

        ",
          "data: {"type":"text-delta","id":"1","delta":"Hello"}

        ",
          "data: {"type":"text-delta","id":"1","delta":", "}

        ",
          "data: {"type":"text-delta","id":"1","delta":"world!"}

        ",
          "data: {"type":"text-end","id":"1"}

        ",
          "data: {"type":"finish-step"}

        ",
          "data: {"type":"finish"}

        ",
          "data: [DONE]

        ",
        ]
      `);
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
        _internal: {
          generateId: mockId({ prefix: 'id' }),
        },
        onError: () => {},
      });

      result.pipeUIMessageStreamToResponse(mockResponse);

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
        _internal: {
          generateId: mockId({ prefix: 'id' }),
        },
        onError: () => {},
      });

      result.pipeUIMessageStreamToResponse(mockResponse, {
        onError: error => `custom error message: ${error}`,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });

    it('should omit message finish event (d:) when sendFinish is false', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello, World!' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        ...defaultSettings(),
      });

      result.pipeUIMessageStreamToResponse(mockResponse, { sendFinish: false });

      await mockResponse.waitForEnd();

      expect(mockResponse.getDecodedChunks()).toMatchInlineSnapshot(`
        [
          "data: {"type":"start"}

        ",
          "data: {"type":"start-step"}

        ",
          "data: {"type":"text-start","id":"1"}

        ",
          "data: {"type":"text-delta","id":"1","delta":"Hello, World!"}

        ",
          "data: {"type":"text-end","id":"1"}

        ",
          "data: {"type":"finish-step"}

        ",
          "data: [DONE]

        ",
        ]
      `);
    });

    it('should write reasoning content to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      result.pipeUIMessageStreamToResponse(mockResponse, {
        sendReasoning: true,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toMatchInlineSnapshot(`
        {
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "content-type": "text/event-stream",
          "x-accel-buffering": "no",
          "x-vercel-ai-ui-message-stream": "v1",
        }
      `);
      expect(mockResponse.getDecodedChunks()).toMatchInlineSnapshot(`
        [
          "data: {"type":"start"}

        ",
          "data: {"type":"start-step"}

        ",
          "data: {"type":"reasoning-start","id":"1"}

        ",
          "data: {"type":"reasoning-delta","id":"1","delta":"I will open the conversation"}

        ",
          "data: {"type":"reasoning-delta","id":"1","delta":" with witty banter."}

        ",
          "data: {"type":"reasoning-delta","id":"1","delta":"","providerMetadata":{"testProvider":{"signature":"1234567890"}}}

        ",
          "data: {"type":"reasoning-end","id":"1"}

        ",
          "data: {"type":"reasoning-start","id":"2","providerMetadata":{"testProvider":{"redactedData":"redacted-reasoning-data"}}}

        ",
          "data: {"type":"reasoning-end","id":"2"}

        ",
          "data: {"type":"reasoning-start","id":"3"}

        ",
          "data: {"type":"reasoning-delta","id":"3","delta":" Once the user has relaxed,"}

        ",
          "data: {"type":"reasoning-delta","id":"3","delta":" I will pry for valuable information."}

        ",
          "data: {"type":"reasoning-end","id":"3","providerMetadata":{"testProvider":{"signature":"1234567890"}}}

        ",
          "data: {"type":"reasoning-start","id":"4","providerMetadata":{"testProvider":{"signature":"1234567890"}}}

        ",
          "data: {"type":"reasoning-delta","id":"4","delta":" I need to think about"}

        ",
          "data: {"type":"reasoning-delta","id":"4","delta":" this problem carefully."}

        ",
          "data: {"type":"reasoning-start","id":"5","providerMetadata":{"testProvider":{"signature":"1234567890"}}}

        ",
          "data: {"type":"reasoning-delta","id":"5","delta":" The best solution"}

        ",
          "data: {"type":"reasoning-delta","id":"5","delta":" requires careful"}

        ",
          "data: {"type":"reasoning-delta","id":"5","delta":" consideration of all factors."}

        ",
          "data: {"type":"reasoning-end","id":"4","providerMetadata":{"testProvider":{"signature":"0987654321"}}}

        ",
          "data: {"type":"reasoning-end","id":"5","providerMetadata":{"testProvider":{"signature":"0987654321"}}}

        ",
          "data: {"type":"text-start","id":"1"}

        ",
          "data: {"type":"text-delta","id":"1","delta":"Hi"}

        ",
          "data: {"type":"text-delta","id":"1","delta":" there!"}

        ",
          "data: {"type":"text-end","id":"1"}

        ",
          "data: {"type":"finish-step"}

        ",
          "data: {"type":"finish"}

        ",
          "data: [DONE]

        ",
        ]
      `);
    });

    it('should write source content to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      result.pipeUIMessageStreamToResponse(mockResponse, {
        sendSources: true,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toMatchInlineSnapshot(`
        {
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "content-type": "text/event-stream",
          "x-accel-buffering": "no",
          "x-vercel-ai-ui-message-stream": "v1",
        }
      `);
      expect(mockResponse.getDecodedChunks()).toMatchInlineSnapshot(`
        [
          "data: {"type":"start"}

        ",
          "data: {"type":"start-step"}

        ",
          "data: {"type":"source-url","sourceId":"123","url":"https://example.com","title":"Example","providerMetadata":{"provider":{"custom":"value"}}}

        ",
          "data: {"type":"text-start","id":"1"}

        ",
          "data: {"type":"text-delta","id":"1","delta":"Hello!"}

        ",
          "data: {"type":"text-end","id":"1"}

        ",
          "data: {"type":"source-url","sourceId":"456","url":"https://example.com/2","title":"Example 2","providerMetadata":{"provider":{"custom":"value2"}}}

        ",
          "data: {"type":"finish-step"}

        ",
          "data: {"type":"finish"}

        ",
          "data: [DONE]

        ",
        ]
      `);
    });

    it('should write file content to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      result.pipeUIMessageStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toMatchInlineSnapshot(`
        {
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "content-type": "text/event-stream",
          "x-accel-buffering": "no",
          "x-vercel-ai-ui-message-stream": "v1",
        }
      `);
      expect(mockResponse.getDecodedChunks()).toMatchInlineSnapshot(`
        [
          "data: {"type":"start"}

        ",
          "data: {"type":"start-step"}

        ",
          "data: {"type":"file","mediaType":"text/plain","url":"data:text/plain;base64,Hello World"}

        ",
          "data: {"type":"text-start","id":"1"}

        ",
          "data: {"type":"text-delta","id":"1","delta":"Hello!"}

        ",
          "data: {"type":"text-end","id":"1"}

        ",
          "data: {"type":"file","mediaType":"image/jpeg","url":"data:image/jpeg;base64,QkFVRw=="}

        ",
          "data: {"type":"finish-step"}

        ",
          "data: {"type":"finish"}

        ",
          "data: [DONE]

        ",
        ]
      `);
    });
  });

  describe('result.pipeTextStreamToResponse', async () => {
    it('should write text deltas to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-delta', id: '1', delta: ', ' },
            { type: 'text-delta', id: '1', delta: 'world!' },
            { type: 'text-end', id: '1' },
          ]),
        }),
        prompt: 'test-input',
      });

      result.pipeTextStreamToResponse(mockResponse);

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toMatchInlineSnapshot(`
        {
          "content-type": "text/plain; charset=utf-8",
        }
      `);
      expect(mockResponse.getDecodedChunks()).toEqual([
        'Hello',
        ', ',
        'world!',
      ]);
    });
  });

  describe('result.toUIMessageStream', () => {
    it('should create a ui message stream', async () => {
      const result = streamText({
        model: createTestModel(),
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream();

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": ", ",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": "world!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
    });

    it('should create a ui message stream with provider metadata', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'stream-start',
              warnings: [],
            },
            {
              type: 'reasoning-start',
              id: 'r1',
              providerMetadata: { testProvider: { signature: 'r1' } },
            },
            {
              type: 'reasoning-delta',
              id: 'r1',
              delta: 'Hello',
              providerMetadata: { testProvider: { signature: 'r2' } },
            },
            {
              type: 'reasoning-delta',
              id: 'r1',
              delta: ', ',
              providerMetadata: { testProvider: { signature: 'r3' } },
            },
            {
              type: 'reasoning-end',
              id: 'r1',
              providerMetadata: { testProvider: { signature: 'r4' } },
            },
            {
              type: 'text-start',
              id: '1',
              providerMetadata: { testProvider: { signature: '1' } },
            },
            {
              type: 'text-delta',
              id: '1',
              delta: 'Hello',
              providerMetadata: { testProvider: { signature: '2' } },
            },
            {
              type: 'text-delta',
              id: '1',
              delta: ', ',
              providerMetadata: { testProvider: { signature: '3' } },
            },
            {
              type: 'text-delta',
              id: '1',
              delta: 'world!',
              providerMetadata: { testProvider: { signature: '4' } },
            },
            {
              type: 'text-end',
              id: '1',
              providerMetadata: { testProvider: { signature: '5' } },
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream();

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "id": "r1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "r1",
                },
              },
              "type": "reasoning-start",
            },
            {
              "delta": "Hello",
              "id": "r1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "r2",
                },
              },
              "type": "reasoning-delta",
            },
            {
              "delta": ", ",
              "id": "r1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "r3",
                },
              },
              "type": "reasoning-delta",
            },
            {
              "id": "r1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "r4",
                },
              },
              "type": "reasoning-end",
            },
            {
              "id": "1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "1",
                },
              },
              "type": "text-start",
            },
            {
              "delta": "Hello",
              "id": "1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "2",
                },
              },
              "type": "text-delta",
            },
            {
              "delta": ", ",
              "id": "1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "3",
                },
              },
              "type": "text-delta",
            },
            {
              "delta": "world!",
              "id": "1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "4",
                },
              },
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "5",
                },
              },
              "type": "text-end",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
    });

    it('should send tool call, tool call stream start, tool call deltas, and tool result stream parts', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'tool-input-start', id: 'call-1', toolName: 'tool1' },
            { type: 'tool-input-delta', id: 'call-1', delta: '{ "value":' },
            { type: 'tool-input-delta', id: 'call-1', delta: ' "value" }' },
            { type: 'tool-input-end', id: 'call-1' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        ...defaultSettings(),
      });

      expect(
        await convertReadableStreamToArray(result.toUIMessageStream()),
      ).toMatchSnapshot();
    });

    it('should send message metadata as defined in the metadata function', async () => {
      const result = streamText({
        model: createTestModel(),
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream({
        messageMetadata: mockValues(
          { key1: 'value1' },
          { key2: 'value2' },
          { key3: 'value3' },
          { key4: 'value4' },
          { key5: 'value5' },
          { key6: 'value6' },
          { key7: 'value7' },
          { key8: 'value8' },
        ),
      });

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "messageMetadata": {
                "key1": "value1",
              },
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "messageMetadata": {
                "key2": "value2",
              },
              "type": "message-metadata",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "messageMetadata": {
                "key3": "value3",
              },
              "type": "message-metadata",
            },
            {
              "delta": "Hello",
              "id": "1",
              "type": "text-delta",
            },
            {
              "messageMetadata": {
                "key4": "value4",
              },
              "type": "message-metadata",
            },
            {
              "delta": ", ",
              "id": "1",
              "type": "text-delta",
            },
            {
              "messageMetadata": {
                "key5": "value5",
              },
              "type": "message-metadata",
            },
            {
              "delta": "world!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "messageMetadata": {
                "key6": "value6",
              },
              "type": "message-metadata",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "messageMetadata": {
                "key7": "value7",
              },
              "type": "message-metadata",
            },
            {
              "type": "finish-step",
            },
            {
              "messageMetadata": {
                "key8": "value8",
              },
              "type": "message-metadata",
            },
            {
              "messageMetadata": {
                "key8": "value8",
              },
              "type": "finish",
            },
          ]
        `);
    });

    it('should mask error messages by default', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        ...defaultSettings(),
        onError: () => {},
      });

      const uiMessageStream = result.toUIMessageStream();

      expect(
        await convertReadableStreamToArray(uiMessageStream),
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
        onError: () => {},
      });

      const uiMessageStream = result.toUIMessageStream({
        onError: error => `custom error message: ${error}`,
      });

      expect(
        await convertReadableStreamToArray(uiMessageStream),
      ).toMatchSnapshot();
    });

    it('should omit message finish event when sendFinish is false', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello, World!' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream({ sendFinish: false });

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello, World!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "type": "finish-step",
            },
          ]
        `);
    });

    it('should omit message start event when sendStart is false', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello, World!' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream({ sendStart: false });

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start-step",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello, World!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
    });

    it('should send reasoning content when sendReasoning is true', async () => {
      const result = streamText({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream({ sendReasoning: true });

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "id": "1",
              "type": "reasoning-start",
            },
            {
              "delta": "I will open the conversation",
              "id": "1",
              "type": "reasoning-delta",
            },
            {
              "delta": " with witty banter.",
              "id": "1",
              "type": "reasoning-delta",
            },
            {
              "delta": "",
              "id": "1",
              "providerMetadata": {
                "testProvider": {
                  "signature": "1234567890",
                },
              },
              "type": "reasoning-delta",
            },
            {
              "id": "1",
              "type": "reasoning-end",
            },
            {
              "id": "2",
              "providerMetadata": {
                "testProvider": {
                  "redactedData": "redacted-reasoning-data",
                },
              },
              "type": "reasoning-start",
            },
            {
              "id": "2",
              "type": "reasoning-end",
            },
            {
              "id": "3",
              "type": "reasoning-start",
            },
            {
              "delta": " Once the user has relaxed,",
              "id": "3",
              "type": "reasoning-delta",
            },
            {
              "delta": " I will pry for valuable information.",
              "id": "3",
              "type": "reasoning-delta",
            },
            {
              "id": "3",
              "providerMetadata": {
                "testProvider": {
                  "signature": "1234567890",
                },
              },
              "type": "reasoning-end",
            },
            {
              "id": "4",
              "providerMetadata": {
                "testProvider": {
                  "signature": "1234567890",
                },
              },
              "type": "reasoning-start",
            },
            {
              "delta": " I need to think about",
              "id": "4",
              "type": "reasoning-delta",
            },
            {
              "delta": " this problem carefully.",
              "id": "4",
              "type": "reasoning-delta",
            },
            {
              "id": "5",
              "providerMetadata": {
                "testProvider": {
                  "signature": "1234567890",
                },
              },
              "type": "reasoning-start",
            },
            {
              "delta": " The best solution",
              "id": "5",
              "type": "reasoning-delta",
            },
            {
              "delta": " requires careful",
              "id": "5",
              "type": "reasoning-delta",
            },
            {
              "delta": " consideration of all factors.",
              "id": "5",
              "type": "reasoning-delta",
            },
            {
              "id": "4",
              "providerMetadata": {
                "testProvider": {
                  "signature": "0987654321",
                },
              },
              "type": "reasoning-end",
            },
            {
              "id": "5",
              "providerMetadata": {
                "testProvider": {
                  "signature": "0987654321",
                },
              },
              "type": "reasoning-end",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hi",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": " there!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
    });

    it('should send source content when sendSources is true', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream({ sendSources: true });

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "providerMetadata": {
                "provider": {
                  "custom": "value",
                },
              },
              "sourceId": "123",
              "title": "Example",
              "type": "source-url",
              "url": "https://example.com",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "providerMetadata": {
                "provider": {
                  "custom": "value2",
                },
              },
              "sourceId": "456",
              "title": "Example 2",
              "type": "source-url",
              "url": "https://example.com/2",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
    });

    it('should send document source content when sendSources is true', async () => {
      const result = streamText({
        model: modelWithDocumentSources,
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream({ sendSources: true });

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "filename": "example.pdf",
              "mediaType": "application/pdf",
              "providerMetadata": {
                "provider": {
                  "custom": "doc-value",
                },
              },
              "sourceId": "doc-123",
              "title": "Document Example",
              "type": "source-document",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello from document!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "filename": undefined,
              "mediaType": "text/plain",
              "providerMetadata": {
                "provider": {
                  "custom": "doc-value2",
                },
              },
              "sourceId": "doc-456",
              "title": "Text Document",
              "type": "source-document",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
    });

    it('should send file content', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream();

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "mediaType": "text/plain",
              "type": "file",
              "url": "data:text/plain;base64,Hello World",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "mediaType": "image/jpeg",
              "type": "file",
              "url": "data:image/jpeg;base64,QkFVRw==",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
    });

    it('should not generate a new message id when onFinish is provided and generateMessageId is not provided', async () => {
      const result = streamText({
        model: createTestModel(),
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream({
        onFinish: () => {}, // provided onFinish should trigger a new message id
      });

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": ", ",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": "world!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
    });

    it('should generate a new message id when generateMessageId is provided', async () => {
      const result = streamText({
        model: createTestModel(),
        ...defaultSettings(),
      });

      const uiMessageStream = result.toUIMessageStream({
        generateMessageId: mockId({ prefix: 'message' }),
      });

      expect(await convertReadableStreamToArray(uiMessageStream))
        .toMatchInlineSnapshot(`
          [
            {
              "messageId": "message-0",
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": ", ",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": "world!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
    });
  });

  describe('result.toUIMessageStreamResponse', () => {
    it('should create a Response with a data stream', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        _internal: {
          generateId: mockId({ prefix: 'id' }),
        },
      });

      const response = result.toUIMessageStreamResponse();

      expect(response.status).toStrictEqual(200);
      expect(Object.fromEntries(response.headers.entries()))
        .toMatchInlineSnapshot(`
          {
            "cache-control": "no-cache",
            "connection": "keep-alive",
            "content-type": "text/event-stream",
            "x-accel-buffering": "no",
            "x-vercel-ai-ui-message-stream": "v1",
          }
        `);

      expect(await convertResponseStreamToArray(response))
        .toMatchInlineSnapshot(`
        [
          "data: {"type":"start"}

        ",
          "data: {"type":"start-step"}

        ",
          "data: {"type":"text-start","id":"1"}

        ",
          "data: {"type":"text-delta","id":"1","delta":"Hello"}

        ",
          "data: {"type":"text-delta","id":"1","delta":", "}

        ",
          "data: {"type":"text-delta","id":"1","delta":"world!"}

        ",
          "data: {"type":"text-end","id":"1"}

        ",
          "data: {"type":"finish-step"}

        ",
          "data: {"type":"finish"}

        ",
          "data: [DONE]

        ",
        ]
      `);
    });

    it('should create a Response with a data stream and custom headers', async () => {
      const result = streamText({
        model: createTestModel(),
        prompt: 'test-input',
        _internal: {
          generateId: mockId({ prefix: 'id' }),
        },
      });

      const response = result.toUIMessageStreamResponse({
        status: 201,
        statusText: 'foo',
        headers: {
          'custom-header': 'custom-value',
        },
      });

      expect(response.status).toStrictEqual(201);
      expect(response.statusText).toStrictEqual('foo');
      expect(Object.fromEntries(response.headers.entries()))
        .toMatchInlineSnapshot(`
          {
            "cache-control": "no-cache",
            "connection": "keep-alive",
            "content-type": "text/event-stream",
            "custom-header": "custom-value",
            "x-accel-buffering": "no",
            "x-vercel-ai-ui-message-stream": "v1",
          }
        `);
      expect(await convertResponseStreamToArray(response))
        .toMatchInlineSnapshot(`
        [
          "data: {"type":"start"}

        ",
          "data: {"type":"start-step"}

        ",
          "data: {"type":"text-start","id":"1"}

        ",
          "data: {"type":"text-delta","id":"1","delta":"Hello"}

        ",
          "data: {"type":"text-delta","id":"1","delta":", "}

        ",
          "data: {"type":"text-delta","id":"1","delta":"world!"}

        ",
          "data: {"type":"text-end","id":"1"}

        ",
          "data: {"type":"finish-step"}

        ",
          "data: {"type":"finish"}

        ",
          "data: [DONE]

        ",
        ]
      `);
    });

    it('should mask error messages by default', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
        }),
        prompt: 'test-input',
        _internal: {
          generateId: mockId({ prefix: 'id' }),
        },
        onError: () => {},
      });

      const response = result.toUIMessageStreamResponse();

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
        _internal: {
          generateId: mockId({ prefix: 'id' }),
        },
        onError: () => {},
      });

      const response = result.toUIMessageStreamResponse({
        onError: error => `custom error message: ${error}`,
      });

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
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
              controller.enqueue({ type: 'text-start', id: '1' });
              controller.enqueue({
                type: 'text-delta',
                id: '1',
                delta: 'Hello',
              });
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
              controller.enqueue({ type: 'text-start', id: '1' });
              controller.enqueue({
                type: 'text-delta',
                id: '1',
                delta: 'Hello',
              });
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
              controller.enqueue({ type: 'text-start', id: '1' });
              controller.enqueue({
                type: 'text-delta',
                id: '1',
                delta: 'Hello',
              });
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
              controller.enqueue({ type: 'text-start', id: '1' });
              controller.enqueue({
                type: 'text-delta',
                id: '1',
                delta: 'Hello',
              });
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
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-delta', id: '1', delta: ', ' },
            { type: 'text-delta', id: '1', delta: 'world!' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        prompt: 'test-input',
        _internal: {
          generateId: mockId({ prefix: 'id' }),
        },
      });

      expect({
        textStream: await convertAsyncIterableToArray(result.textStream),
        fullStream: await convertAsyncIterableToArray(result.fullStream),
        uiMessageStream: await convertReadableStreamToArray(
          result.toUIMessageStream(),
        ),
      }).toMatchInlineSnapshot(`
        {
          "fullStream": [
            {
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "Hello",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": ", ",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "world!",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
            },
            {
              "finishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "type": "finish",
            },
          ],
          "textStream": [
            "Hello",
            ", ",
            "world!",
          ],
          "uiMessageStream": [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": ", ",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": "world!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ],
        }
      `);
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
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.usage).toMatchInlineSnapshot(`
        {
          "cachedInputTokens": undefined,
          "inputTokens": 3,
          "outputTokens": 10,
          "reasoningTokens": undefined,
          "totalTokens": 13,
        }
      `);
    });
  });

  describe('result.finishReason', () => {
    it('should resolve with finish reason', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
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
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
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

      expect((await result.response).messages).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "providerOptions": {
                  "testProvider": {
                    "signature": "1234567890",
                  },
                },
                "text": "I will open the conversation with witty banter.",
                "type": "reasoning",
              },
              {
                "providerOptions": {
                  "testProvider": {
                    "redactedData": "redacted-reasoning-data",
                  },
                },
                "text": "",
                "type": "reasoning",
              },
              {
                "providerOptions": {
                  "testProvider": {
                    "signature": "1234567890",
                  },
                },
                "text": " Once the user has relaxed, I will pry for valuable information.",
                "type": "reasoning",
              },
              {
                "providerOptions": {
                  "testProvider": {
                    "signature": "0987654321",
                  },
                },
                "text": " I need to think about this problem carefully.",
                "type": "reasoning",
              },
              {
                "providerOptions": {
                  "testProvider": {
                    "signature": "0987654321",
                  },
                },
                "text": " The best solution requires careful consideration of all factors.",
                "type": "reasoning",
              },
              {
                "providerOptions": undefined,
                "text": "Hi there!",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
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
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
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
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
          response: { headers: { call: '2' } },
        }),
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.response).toMatchInlineSnapshot(`
        {
          "headers": {
            "call": "2",
          },
          "id": "id-0",
          "messages": [
            {
              "content": [
                {
                  "providerOptions": undefined,
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          "modelId": "mock-model-id",
          "timestamp": 1970-01-01T00:00:00.000Z,
        }
      `);
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

      expect(await result.steps).toMatchInlineSnapshot(`
        [
          DefaultStepResult {
            "content": [
              {
                "providerMetadata": {
                  "testProvider": {
                    "signature": "1234567890",
                  },
                },
                "text": "I will open the conversation with witty banter.",
                "type": "reasoning",
              },
              {
                "providerMetadata": {
                  "testProvider": {
                    "redactedData": "redacted-reasoning-data",
                  },
                },
                "text": "",
                "type": "reasoning",
              },
              {
                "providerMetadata": {
                  "testProvider": {
                    "signature": "1234567890",
                  },
                },
                "text": " Once the user has relaxed, I will pry for valuable information.",
                "type": "reasoning",
              },
              {
                "providerMetadata": {
                  "testProvider": {
                    "signature": "0987654321",
                  },
                },
                "text": " I need to think about this problem carefully.",
                "type": "reasoning",
              },
              {
                "providerMetadata": {
                  "testProvider": {
                    "signature": "0987654321",
                  },
                },
                "text": " The best solution requires careful consideration of all factors.",
                "type": "reasoning",
              },
              {
                "providerMetadata": undefined,
                "text": "Hi there!",
                "type": "text",
              },
            ],
            "finishReason": "stop",
            "providerMetadata": undefined,
            "request": {},
            "response": {
              "headers": undefined,
              "id": "id-0",
              "messages": [
                {
                  "content": [
                    {
                      "providerOptions": {
                        "testProvider": {
                          "signature": "1234567890",
                        },
                      },
                      "text": "I will open the conversation with witty banter.",
                      "type": "reasoning",
                    },
                    {
                      "providerOptions": {
                        "testProvider": {
                          "redactedData": "redacted-reasoning-data",
                        },
                      },
                      "text": "",
                      "type": "reasoning",
                    },
                    {
                      "providerOptions": {
                        "testProvider": {
                          "signature": "1234567890",
                        },
                      },
                      "text": " Once the user has relaxed, I will pry for valuable information.",
                      "type": "reasoning",
                    },
                    {
                      "providerOptions": {
                        "testProvider": {
                          "signature": "0987654321",
                        },
                      },
                      "text": " I need to think about this problem carefully.",
                      "type": "reasoning",
                    },
                    {
                      "providerOptions": {
                        "testProvider": {
                          "signature": "0987654321",
                        },
                      },
                      "text": " The best solution requires careful consideration of all factors.",
                      "type": "reasoning",
                    },
                    {
                      "providerOptions": undefined,
                      "text": "Hi there!",
                      "type": "text",
                    },
                  ],
                  "role": "assistant",
                },
              ],
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
            "warnings": [],
          },
        ]
      `);
    });

    it('should add the sources from the model response to the step result', async () => {
      const result = streamText({
        model: modelWithSources,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.steps).toMatchInlineSnapshot(`
        [
          DefaultStepResult {
            "content": [
              {
                "id": "123",
                "providerMetadata": {
                  "provider": {
                    "custom": "value",
                  },
                },
                "sourceType": "url",
                "title": "Example",
                "type": "source",
                "url": "https://example.com",
              },
              {
                "providerMetadata": undefined,
                "text": "Hello!",
                "type": "text",
              },
              {
                "id": "456",
                "providerMetadata": {
                  "provider": {
                    "custom": "value2",
                  },
                },
                "sourceType": "url",
                "title": "Example 2",
                "type": "source",
                "url": "https://example.com/2",
              },
            ],
            "finishReason": "stop",
            "providerMetadata": undefined,
            "request": {},
            "response": {
              "headers": undefined,
              "id": "id-0",
              "messages": [
                {
                  "content": [
                    {
                      "providerOptions": undefined,
                      "text": "Hello!",
                      "type": "text",
                    },
                  ],
                  "role": "assistant",
                },
              ],
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
            "warnings": [],
          },
        ]
      `);
    });

    it('should add the files from the model response to the step result', async () => {
      const result = streamText({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      result.consumeStream();

      expect(await result.steps).toMatchInlineSnapshot(`
        [
          DefaultStepResult {
            "content": [
              {
                "file": DefaultGeneratedFileWithType {
                  "base64Data": "Hello World",
                  "mediaType": "text/plain",
                  "type": "file",
                  "uint8ArrayData": undefined,
                },
                "type": "file",
              },
              {
                "providerMetadata": undefined,
                "text": "Hello!",
                "type": "text",
              },
              {
                "file": DefaultGeneratedFileWithType {
                  "base64Data": "QkFVRw==",
                  "mediaType": "image/jpeg",
                  "type": "file",
                  "uint8ArrayData": undefined,
                },
                "type": "file",
              },
            ],
            "finishReason": "stop",
            "providerMetadata": undefined,
            "request": {},
            "response": {
              "headers": undefined,
              "id": "id-0",
              "messages": [
                {
                  "content": [
                    {
                      "data": "Hello World",
                      "mediaType": "text/plain",
                      "providerOptions": undefined,
                      "type": "file",
                    },
                    {
                      "providerOptions": undefined,
                      "text": "Hello!",
                      "type": "text",
                    },
                    {
                      "data": "QkFVRw==",
                      "mediaType": "image/jpeg",
                      "providerOptions": undefined,
                      "type": "file",
                    },
                  ],
                  "role": "assistant",
                },
              ],
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
            "warnings": [],
          },
        ]
      `);
    });
  });

  describe('result.toolCalls', () => {
    it('should resolve with tool calls', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
          }),
        },
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.toolCalls).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "value",
            },
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-call",
          },
        ]
      `);
    });
  });

  describe('result.toolResults', () => {
    it('should resolve with tool results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
      });

      result.consumeStream();

      expect(await result.toolResults).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "value",
            },
            "output": "value-result",
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-result",
          },
        ]
      `);
    });
  });

  describe('options.onChunk', () => {
    let result: Array<
      Extract<
        TextStreamPart<any>,
        {
          type:
            | 'text-delta'
            | 'reasoning-delta'
            | 'source'
            | 'tool-call'
            | 'tool-input-start'
            | 'tool-input-delta'
            | 'tool-result'
            | 'raw';
        }
      >
    >;

    beforeEach(async () => {
      result = [];

      const resultObject = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-end', id: '1' },
            { type: 'tool-input-start', id: '2', toolName: 'tool1' },
            { type: 'tool-input-delta', id: '2', delta: '{"value": "' },
            { type: 'reasoning-start', id: '3' },
            { type: 'reasoning-delta', id: '3', delta: 'Feeling clever' },
            { type: 'reasoning-end', id: '3' },
            { type: 'tool-input-delta', id: '2', delta: 'test' },
            { type: 'tool-input-delta', id: '2', delta: '"}' },
            {
              type: 'source',
              sourceType: 'url',
              id: '123',
              url: 'https://example.com',
              title: 'Example',
              providerMetadata: { provider: { custom: 'value' } },
            },
            { type: 'tool-input-end', id: '2' },
            {
              type: 'tool-call',
              toolCallId: '2',
              toolName: 'tool1',
              input: `{ "value": "test" }`,
              providerMetadata: { provider: { custom: 'value' } },
            },
            { type: 'text-start', id: '4' },
            { type: 'text-delta', id: '4', delta: ' World' },
            { type: 'text-end', id: '4' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage2,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
        onChunk(event) {
          result.push(event.chunk);
        },
      });

      await resultObject.consumeStream();
    });

    it('should return events in order', async () => {
      expect(result).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "providerMetadata": undefined,
            "text": "Hello",
            "type": "text-delta",
          },
          {
            "dynamic": false,
            "id": "2",
            "toolName": "tool1",
            "type": "tool-input-start",
          },
          {
            "delta": "{"value": "",
            "id": "2",
            "type": "tool-input-delta",
          },
          {
            "id": "3",
            "providerMetadata": undefined,
            "text": "Feeling clever",
            "type": "reasoning-delta",
          },
          {
            "delta": "test",
            "id": "2",
            "type": "tool-input-delta",
          },
          {
            "delta": ""}",
            "id": "2",
            "type": "tool-input-delta",
          },
          {
            "id": "123",
            "providerMetadata": {
              "provider": {
                "custom": "value",
              },
            },
            "sourceType": "url",
            "title": "Example",
            "type": "source",
            "url": "https://example.com",
          },
          {
            "input": {
              "value": "test",
            },
            "providerExecuted": undefined,
            "providerMetadata": {
              "provider": {
                "custom": "value",
              },
            },
            "toolCallId": "2",
            "toolName": "tool1",
            "type": "tool-call",
          },
          {
            "input": {
              "value": "test",
            },
            "output": "test-result",
            "providerExecuted": undefined,
            "providerMetadata": {
              "provider": {
                "custom": "value",
              },
            },
            "toolCallId": "2",
            "toolName": "tool1",
            "type": "tool-result",
          },
          {
            "id": "4",
            "providerMetadata": undefined,
            "text": " World",
            "type": "text-delta",
          },
        ]
      `);
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
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-delta', id: '1', delta: ', ' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            { type: 'text-delta', id: '1', delta: `world!` },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
          response: { headers: { call: '2' } },
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        onFinish: async event => {
          result = event as unknown as typeof result;
        },
        ...defaultSettings(),
      });

      await resultObject.consumeStream();

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "providerMetadata": undefined,
              "text": "Hello, world!",
              "type": "text",
            },
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            {
              "input": {
                "value": "value",
              },
              "output": "value-result",
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          ],
          "dynamicToolCalls": [],
          "dynamicToolResults": [],
          "files": [],
          "finishReason": "stop",
          "providerMetadata": {
            "testProvider": {
              "testKey": "testValue",
            },
          },
          "reasoning": [],
          "reasoningText": undefined,
          "request": {},
          "response": {
            "headers": {
              "call": "2",
            },
            "id": "id-0",
            "messages": [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
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
                      "value": "value-result",
                    },
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
            ],
            "modelId": "mock-model-id",
            "timestamp": 1970-01-01T00:00:00.000Z,
          },
          "sources": [],
          "staticToolCalls": [],
          "staticToolResults": [],
          "steps": [
            DefaultStepResult {
              "content": [
                {
                  "providerMetadata": undefined,
                  "text": "Hello, world!",
                  "type": "text",
                },
                {
                  "input": {
                    "value": "value",
                  },
                  "providerExecuted": undefined,
                  "providerMetadata": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-call",
                },
                {
                  "input": {
                    "value": "value",
                  },
                  "output": "value-result",
                  "providerExecuted": undefined,
                  "providerMetadata": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-result",
                },
              ],
              "finishReason": "stop",
              "providerMetadata": {
                "testProvider": {
                  "testKey": "testValue",
                },
              },
              "request": {},
              "response": {
                "headers": {
                  "call": "2",
                },
                "id": "id-0",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "Hello, world!",
                        "type": "text",
                      },
                      {
                        "input": {
                          "value": "value",
                        },
                        "providerExecuted": undefined,
                        "providerOptions": undefined,
                        "toolCallId": "call-1",
                        "toolName": "tool1",
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
                          "value": "value-result",
                        },
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-result",
                      },
                    ],
                    "role": "tool",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "warnings": [],
            },
          ],
          "text": "Hello, world!",
          "toolCalls": [
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
          ],
          "toolResults": [
            {
              "input": {
                "value": "value",
              },
              "output": "value-result",
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          ],
          "totalUsage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "warnings": [],
        }
      `);
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

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "id": "123",
              "providerMetadata": {
                "provider": {
                  "custom": "value",
                },
              },
              "sourceType": "url",
              "title": "Example",
              "type": "source",
              "url": "https://example.com",
            },
            {
              "providerMetadata": undefined,
              "text": "Hello!",
              "type": "text",
            },
            {
              "id": "456",
              "providerMetadata": {
                "provider": {
                  "custom": "value2",
                },
              },
              "sourceType": "url",
              "title": "Example 2",
              "type": "source",
              "url": "https://example.com/2",
            },
          ],
          "dynamicToolCalls": [],
          "dynamicToolResults": [],
          "files": [],
          "finishReason": "stop",
          "providerMetadata": undefined,
          "reasoning": [],
          "reasoningText": undefined,
          "request": {},
          "response": {
            "headers": undefined,
            "id": "id-0",
            "messages": [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "Hello!",
                    "type": "text",
                  },
                ],
                "role": "assistant",
              },
            ],
            "modelId": "mock-model-id",
            "timestamp": 1970-01-01T00:00:00.000Z,
          },
          "sources": [
            {
              "id": "123",
              "providerMetadata": {
                "provider": {
                  "custom": "value",
                },
              },
              "sourceType": "url",
              "title": "Example",
              "type": "source",
              "url": "https://example.com",
            },
            {
              "id": "456",
              "providerMetadata": {
                "provider": {
                  "custom": "value2",
                },
              },
              "sourceType": "url",
              "title": "Example 2",
              "type": "source",
              "url": "https://example.com/2",
            },
          ],
          "staticToolCalls": [],
          "staticToolResults": [],
          "steps": [
            DefaultStepResult {
              "content": [
                {
                  "id": "123",
                  "providerMetadata": {
                    "provider": {
                      "custom": "value",
                    },
                  },
                  "sourceType": "url",
                  "title": "Example",
                  "type": "source",
                  "url": "https://example.com",
                },
                {
                  "providerMetadata": undefined,
                  "text": "Hello!",
                  "type": "text",
                },
                {
                  "id": "456",
                  "providerMetadata": {
                    "provider": {
                      "custom": "value2",
                    },
                  },
                  "sourceType": "url",
                  "title": "Example 2",
                  "type": "source",
                  "url": "https://example.com/2",
                },
              ],
              "finishReason": "stop",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "headers": undefined,
                "id": "id-0",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "Hello!",
                        "type": "text",
                      },
                    ],
                    "role": "assistant",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "warnings": [],
            },
          ],
          "text": "Hello!",
          "toolCalls": [],
          "toolResults": [],
          "totalUsage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "warnings": [],
        }
      `);
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

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "file": DefaultGeneratedFileWithType {
                "base64Data": "Hello World",
                "mediaType": "text/plain",
                "type": "file",
                "uint8ArrayData": undefined,
              },
              "type": "file",
            },
            {
              "providerMetadata": undefined,
              "text": "Hello!",
              "type": "text",
            },
            {
              "file": DefaultGeneratedFileWithType {
                "base64Data": "QkFVRw==",
                "mediaType": "image/jpeg",
                "type": "file",
                "uint8ArrayData": undefined,
              },
              "type": "file",
            },
          ],
          "dynamicToolCalls": [],
          "dynamicToolResults": [],
          "files": [
            DefaultGeneratedFileWithType {
              "base64Data": "Hello World",
              "mediaType": "text/plain",
              "type": "file",
              "uint8ArrayData": undefined,
            },
            DefaultGeneratedFileWithType {
              "base64Data": "QkFVRw==",
              "mediaType": "image/jpeg",
              "type": "file",
              "uint8ArrayData": undefined,
            },
          ],
          "finishReason": "stop",
          "providerMetadata": undefined,
          "reasoning": [],
          "reasoningText": undefined,
          "request": {},
          "response": {
            "headers": undefined,
            "id": "id-0",
            "messages": [
              {
                "content": [
                  {
                    "data": "Hello World",
                    "mediaType": "text/plain",
                    "providerOptions": undefined,
                    "type": "file",
                  },
                  {
                    "providerOptions": undefined,
                    "text": "Hello!",
                    "type": "text",
                  },
                  {
                    "data": "QkFVRw==",
                    "mediaType": "image/jpeg",
                    "providerOptions": undefined,
                    "type": "file",
                  },
                ],
                "role": "assistant",
              },
            ],
            "modelId": "mock-model-id",
            "timestamp": 1970-01-01T00:00:00.000Z,
          },
          "sources": [],
          "staticToolCalls": [],
          "staticToolResults": [],
          "steps": [
            DefaultStepResult {
              "content": [
                {
                  "file": DefaultGeneratedFileWithType {
                    "base64Data": "Hello World",
                    "mediaType": "text/plain",
                    "type": "file",
                    "uint8ArrayData": undefined,
                  },
                  "type": "file",
                },
                {
                  "providerMetadata": undefined,
                  "text": "Hello!",
                  "type": "text",
                },
                {
                  "file": DefaultGeneratedFileWithType {
                    "base64Data": "QkFVRw==",
                    "mediaType": "image/jpeg",
                    "type": "file",
                    "uint8ArrayData": undefined,
                  },
                  "type": "file",
                },
              ],
              "finishReason": "stop",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "headers": undefined,
                "id": "id-0",
                "messages": [
                  {
                    "content": [
                      {
                        "data": "Hello World",
                        "mediaType": "text/plain",
                        "providerOptions": undefined,
                        "type": "file",
                      },
                      {
                        "providerOptions": undefined,
                        "text": "Hello!",
                        "type": "text",
                      },
                      {
                        "data": "QkFVRw==",
                        "mediaType": "image/jpeg",
                        "providerOptions": undefined,
                        "type": "file",
                      },
                    ],
                    "role": "assistant",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "warnings": [],
            },
          ],
          "text": "Hello!",
          "toolCalls": [],
          "toolResults": [],
          "totalUsage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "warnings": [],
        }
      `);
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
        onError: () => {},
      });

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          type: 'start',
        },
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
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello, ' },
            { type: 'text-delta', id: '1', delta: 'world!' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        prompt: 'test-input',
      });

      result.consumeStream();

      expect((await result.response).messages).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "providerOptions": undefined,
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should contain assistant response message and tool message when there are tool calls with results', async () => {
      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello, ' },
            { type: 'text-delta', id: '1', delta: 'world!' },
            { type: 'text-end', id: '1' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
        },
        prompt: 'test-input',
      });

      result.consumeStream();

      expect((await result.response).messages).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "providerOptions": undefined,
                "text": "Hello, world!",
                "type": "text",
              },
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerOptions": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
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
                  "value": "result1",
                },
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
    });
  });

  describe('options.stopWhen', () => {
    let result: StreamTextResult<any, any>;
    let onFinishResult: Parameters<
      Required<Parameters<typeof streamText>[0]>['onFinish']
    >[0];
    let onStepFinishResults: StepResult<any>[];
    let tracer: MockTracer;
    let stepInputs: Array<any>;

    beforeEach(() => {
      tracer = new MockTracer();
      stepInputs = [];
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
              stepInputs.push({ prompt, tools, toolChoice });

              switch (responseCount++) {
                case 0: {
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      { type: 'reasoning-start', id: '0' },
                      { type: 'reasoning-delta', id: '0', delta: 'thinking' },
                      { type: 'reasoning-end', id: '0' },
                      {
                        type: 'tool-call',
                        id: 'call-1',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        input: `{ "value": "value" }`,
                      },
                      {
                        type: 'finish',
                        finishReason: 'tool-calls',
                        usage: testUsage,
                      },
                    ]),
                    response: { headers: { call: '1' } },
                  };
                }
                case 1: {
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      { type: 'text-start', id: '1' },
                      { type: 'text-delta', id: '1', delta: 'Hello, ' },
                      { type: 'text-delta', id: '1', delta: `world!` },
                      { type: 'text-end', id: '1' },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        usage: testUsage2,
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
              inputSchema: z.object({ value: z.string() }),
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
          stopWhen: stepCountIs(3),
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
            generateId: mockId({ prefix: 'id' }),
          },
        });
      });

      it('should contain correct step inputs', async () => {
        await result.consumeStream();

        expect(stepInputs).toMatchInlineSnapshot(`
          [
            {
              "prompt": [
                {
                  "content": [
                    {
                      "text": "test-input",
                      "type": "text",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "user",
                },
              ],
              "toolChoice": {
                "type": "auto",
              },
              "tools": [
                {
                  "description": undefined,
                  "inputSchema": {
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "additionalProperties": false,
                    "properties": {
                      "value": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "value",
                    ],
                    "type": "object",
                  },
                  "name": "tool1",
                  "providerOptions": undefined,
                  "type": "function",
                },
              ],
            },
            {
              "prompt": [
                {
                  "content": [
                    {
                      "text": "test-input",
                      "type": "text",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "user",
                },
                {
                  "content": [
                    {
                      "providerOptions": undefined,
                      "text": "thinking",
                      "type": "reasoning",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "assistant",
                },
                {
                  "content": [
                    {
                      "output": {
                        "type": "text",
                        "value": "result1",
                      },
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "tool",
                },
              ],
              "toolChoice": {
                "type": "auto",
              },
              "tools": [
                {
                  "description": undefined,
                  "inputSchema": {
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "additionalProperties": false,
                    "properties": {
                      "value": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "value",
                    ],
                    "type": "object",
                  },
                  "name": "tool1",
                  "providerOptions": undefined,
                  "type": "function",
                },
              ],
            },
          ]
        `);
      });

      it('should contain assistant response message and tool message from all steps', async () => {
        expect(await convertAsyncIterableToArray(result.fullStream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "0",
                "type": "reasoning-start",
              },
              {
                "id": "0",
                "providerMetadata": undefined,
                "text": "thinking",
                "type": "reasoning-delta",
              },
              {
                "id": "0",
                "type": "reasoning-end",
              },
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
              {
                "input": {
                  "value": "value",
                },
                "output": "result1",
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
              {
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "Hello, ",
                "type": "text-delta",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "world!",
                "type": "text-delta",
              },
              {
                "id": "1",
                "type": "text-end",
              },
              {
                "finishReason": "stop",
                "providerMetadata": undefined,
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
              },
              {
                "finishReason": "stop",
                "totalUsage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 6,
                  "outputTokens": 20,
                  "reasoningTokens": 10,
                  "totalTokens": 36,
                },
                "type": "finish",
              },
            ]
          `);
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchInlineSnapshot(`
            {
              "content": [
                {
                  "providerMetadata": undefined,
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "dynamicToolCalls": [],
              "dynamicToolResults": [],
              "files": [],
              "finishReason": "stop",
              "providerMetadata": undefined,
              "reasoning": [],
              "reasoningText": undefined,
              "request": {},
              "response": {
                "headers": {
                  "call": "2",
                },
                "id": "id-1",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "thinking",
                        "type": "reasoning",
                      },
                      {
                        "input": {
                          "value": "value",
                        },
                        "providerExecuted": undefined,
                        "providerOptions": undefined,
                        "toolCallId": "call-1",
                        "toolName": "tool1",
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
                          "value": "result1",
                        },
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-result",
                      },
                    ],
                    "role": "tool",
                  },
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "Hello, world!",
                        "type": "text",
                      },
                    ],
                    "role": "assistant",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:01.000Z,
              },
              "sources": [],
              "staticToolCalls": [],
              "staticToolResults": [],
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "thinking",
                      "type": "reasoning",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "finishReason": "stop",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "2",
                    },
                    "id": "id-1",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "Hello, world!",
                            "type": "text",
                          },
                        ],
                        "role": "assistant",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:01.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": 3,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": 10,
                    "totalTokens": 23,
                  },
                  "warnings": [],
                },
              ],
              "text": "Hello, world!",
              "toolCalls": [],
              "toolResults": [],
              "totalUsage": {
                "cachedInputTokens": 3,
                "inputTokens": 6,
                "outputTokens": 20,
                "reasoningTokens": 10,
                "totalTokens": 36,
              },
              "usage": {
                "cachedInputTokens": 3,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": 10,
                "totalTokens": 23,
              },
              "warnings": [],
            }
          `);
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchInlineSnapshot(`
            [
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "output": "result1",
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
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
                            "value": "result1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "warnings": [],
              },
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "finishReason": "stop",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
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
                            "value": "result1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "Hello, world!",
                          "type": "text",
                        },
                      ],
                      "role": "assistant",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
                "warnings": [],
              },
            ]
          `);
        });
      });

      describe('value promises', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('result.totalUsage should contain total token usage', async () => {
          expect(await result.totalUsage).toMatchInlineSnapshot(`
            {
              "cachedInputTokens": 3,
              "inputTokens": 6,
              "outputTokens": 20,
              "reasoningTokens": 10,
              "totalTokens": 36,
            }
          `);
        });

        it('result.usage should contain token usage from final step', async () => {
          expect(await result.totalUsage).toMatchInlineSnapshot(`
          {
            "cachedInputTokens": 3,
            "inputTokens": 6,
            "outputTokens": 20,
            "reasoningTokens": 10,
            "totalTokens": 36,
          }
        `);
        });

        it('result.finishReason should contain finish reason from final step', async () => {
          assert.strictEqual(await result.finishReason, 'stop');
        });

        it('result.text should contain text from final step', async () => {
          assert.strictEqual(await result.text, 'Hello, world!');
        });

        it('result.steps should contain all steps', async () => {
          expect(await result.steps).toMatchInlineSnapshot(`
            [
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "output": "result1",
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
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
                            "value": "result1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "warnings": [],
              },
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "finishReason": "stop",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
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
                            "value": "result1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "Hello, world!",
                          "type": "text",
                        },
                      ],
                      "role": "assistant",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
                "warnings": [],
              },
            ]
          `);
        });

        it('result.response.messages should contain response messages from all steps', async () => {
          expect((await result.response).messages).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
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
                      "value": "result1",
                    },
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "role": "assistant",
              },
            ]
          `);
        });
      });

      it('should record telemetry data for each step', async () => {
        await result.consumeStream();
        expect(tracer.jsonSpans).toMatchSnapshot();
      });

      it('should have correct ui message stream', async () => {
        expect(await convertReadableStreamToArray(result.toUIMessageStream()))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "type": "start-step",
              },
              {
                "id": "0",
                "type": "reasoning-start",
              },
              {
                "delta": "thinking",
                "id": "0",
                "type": "reasoning-delta",
              },
              {
                "id": "0",
                "type": "reasoning-end",
              },
              {
                "input": {
                  "value": "value",
                },
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-input-available",
              },
              {
                "output": "result1",
                "toolCallId": "call-1",
                "type": "tool-output-available",
              },
              {
                "type": "finish-step",
              },
              {
                "type": "start-step",
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "delta": "Hello, ",
                "id": "1",
                "type": "text-delta",
              },
              {
                "delta": "world!",
                "id": "1",
                "type": "text-delta",
              },
              {
                "id": "1",
                "type": "text-end",
              },
              {
                "type": "finish-step",
              },
              {
                "type": "finish",
              },
            ]
          `);
      });
    });

    describe('2 steps: initial, tool-result with prepareStep', () => {
      let result: StreamTextResult<any, any>;
      let doStreamCalls: Array<LanguageModelV2CallOptions>;
      let prepareStepCalls: Array<{
        stepNumber: number;
        steps: Array<StepResult<any>>;
        messages: Array<ModelMessage>;
      }>;

      beforeEach(async () => {
        doStreamCalls = [];
        prepareStepCalls = [];

        result = streamText({
          model: new MockLanguageModelV2({
            doStream: async options => {
              doStreamCalls.push(options);
              switch (doStreamCalls.length) {
                case 1:
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
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        input: `{ "value": "value" }`,
                      },
                      {
                        type: 'finish',
                        finishReason: 'tool-calls',
                        usage: testUsage,
                      },
                    ]),
                    response: { headers: { call: '1' } },
                  };
                case 2:
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      { type: 'text-start', id: '2' },
                      { type: 'text-delta', id: '2', delta: 'Hello, ' },
                      { type: 'text-delta', id: '2', delta: `world!` },
                      { type: 'text-end', id: '2' },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        usage: testUsage2,
                      },
                    ]),
                    response: { headers: { call: '2' } },
                  };
                default:
                  throw new Error(
                    `Unexpected response count: ${doStreamCalls.length}`,
                  );
              }
            },
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            }),
          },
          prompt: 'test-input',
          stopWhen: stepCountIs(3),
          prepareStep: async ({ model, stepNumber, steps, messages }) => {
            prepareStepCalls.push({ stepNumber, steps, messages });

            if (stepNumber === 0) {
              return {
                toolChoice: {
                  type: 'tool',
                  toolName: 'tool1' as const,
                },
                system: 'system-message-0',
                messages: [
                  {
                    role: 'user',
                    content: 'new input from prepareStep',
                  },
                ],
              };
            }

            if (stepNumber === 1) {
              return {
                activeTools: [],
                system: 'system-message-1',
              };
            }
          },
        });
      });

      it('should contain all doStream calls', async () => {
        await result.consumeStream();
        expect(doStreamCalls).toMatchInlineSnapshot(`
          [
            {
              "abortSignal": undefined,
              "frequencyPenalty": undefined,
              "headers": undefined,
              "includeRawChunks": false,
              "maxOutputTokens": undefined,
              "presencePenalty": undefined,
              "prompt": [
                {
                  "content": "system-message-0",
                  "role": "system",
                },
                {
                  "content": [
                    {
                      "text": "new input from prepareStep",
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
                "toolName": "tool1",
                "type": "tool",
              },
              "tools": [
                {
                  "description": undefined,
                  "inputSchema": {
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "additionalProperties": false,
                    "properties": {
                      "value": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "value",
                    ],
                    "type": "object",
                  },
                  "name": "tool1",
                  "providerOptions": undefined,
                  "type": "function",
                },
              ],
              "topK": undefined,
              "topP": undefined,
            },
            {
              "abortSignal": undefined,
              "frequencyPenalty": undefined,
              "headers": undefined,
              "includeRawChunks": false,
              "maxOutputTokens": undefined,
              "presencePenalty": undefined,
              "prompt": [
                {
                  "content": "system-message-1",
                  "role": "system",
                },
                {
                  "content": [
                    {
                      "text": "test-input",
                      "type": "text",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "user",
                },
                {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "assistant",
                },
                {
                  "content": [
                    {
                      "output": {
                        "type": "text",
                        "value": "result1",
                      },
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "tool",
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
              "tools": [],
              "topK": undefined,
              "topP": undefined,
            },
          ]
        `);
      });

      it('should contain all prepareStep calls', async () => {
        await result.consumeStream();
        expect(prepareStepCalls).toMatchInlineSnapshot(`
          [
            {
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "stepNumber": 0,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "finishReason": "stop",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "2",
                    },
                    "id": "id-1",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "Hello, world!",
                            "type": "text",
                          },
                        ],
                        "role": "assistant",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:01.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": 3,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": 10,
                    "totalTokens": 23,
                  },
                  "warnings": [],
                },
              ],
            },
            {
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
                {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
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
                        "value": "result1",
                      },
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "role": "tool",
                },
              ],
              "stepNumber": 1,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "finishReason": "stop",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "2",
                    },
                    "id": "id-1",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "Hello, world!",
                            "type": "text",
                          },
                        ],
                        "role": "assistant",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:01.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": 3,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": 10,
                    "totalTokens": 23,
                  },
                  "warnings": [],
                },
              ],
            },
          ]
        `);
      });
    });

    describe('2 steps: initial, tool-result with transformed tool results', () => {
      const upperCaseToolResultTransform = () =>
        new TransformStream<
          TextStreamPart<{ tool1: Tool<{ value: string }, string> }>,
          TextStreamPart<{ tool1: Tool<{ value: string }, string> }>
        >({
          transform(chunk, controller) {
            if (chunk.type === 'tool-result' && !chunk.dynamic) {
              chunk.output = chunk.output.toUpperCase();
              chunk.input = {
                ...chunk.input,
                value: chunk.input.value.toUpperCase(),
              };
            }

            controller.enqueue(chunk);
          },
        });

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
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      { type: 'reasoning-start', id: 'id-0' },
                      {
                        type: 'reasoning-delta',
                        id: 'id-0',
                        delta: 'thinking',
                      },
                      { type: 'reasoning-end', id: 'id-0' },
                      {
                        type: 'tool-call',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        input: `{ "value": "value" }`,
                      },
                      {
                        type: 'finish',
                        finishReason: 'tool-calls',
                        usage: testUsage,
                      },
                    ]),
                    response: { headers: { call: '1' } },
                  };
                }
                case 1: {
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      { type: 'text-start', id: '1' },
                      { type: 'text-delta', id: '1', delta: 'Hello, ' },
                      { type: 'text-delta', id: '1', delta: `world!` },
                      { type: 'text-end', id: '1' },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        usage: testUsage2,
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
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseToolResultTransform,
          prompt: 'test-input',
          onFinish: async event => {
            expect(onFinishResult).to.be.undefined;
            onFinishResult = event as unknown as typeof onFinishResult;
          },
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          experimental_telemetry: { isEnabled: true, tracer },
          stopWhen: stepCountIs(3),
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
            generateId: mockId({ prefix: 'id' }),
          },
        });
      });

      it('should contain assistant response message and tool message from all steps', async () => {
        expect(await convertAsyncIterableToArray(result.fullStream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "id-0",
                "type": "reasoning-start",
              },
              {
                "id": "id-0",
                "providerMetadata": undefined,
                "text": "thinking",
                "type": "reasoning-delta",
              },
              {
                "id": "id-0",
                "type": "reasoning-end",
              },
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
              {
                "input": {
                  "value": "VALUE",
                },
                "output": "RESULT1",
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
              {
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "Hello, ",
                "type": "text-delta",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "world!",
                "type": "text-delta",
              },
              {
                "id": "1",
                "type": "text-end",
              },
              {
                "finishReason": "stop",
                "providerMetadata": undefined,
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
              },
              {
                "finishReason": "stop",
                "totalUsage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 6,
                  "outputTokens": 20,
                  "reasoningTokens": 10,
                  "totalTokens": 36,
                },
                "type": "finish",
              },
            ]
          `);
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchInlineSnapshot(`
            {
              "content": [
                {
                  "providerMetadata": undefined,
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "dynamicToolCalls": [],
              "dynamicToolResults": [],
              "files": [],
              "finishReason": "stop",
              "providerMetadata": undefined,
              "reasoning": [],
              "reasoningText": undefined,
              "request": {},
              "response": {
                "headers": {
                  "call": "2",
                },
                "id": "id-1",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "thinking",
                        "type": "reasoning",
                      },
                      {
                        "input": {
                          "value": "value",
                        },
                        "providerExecuted": undefined,
                        "providerOptions": undefined,
                        "toolCallId": "call-1",
                        "toolName": "tool1",
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
                          "value": "RESULT1",
                        },
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-result",
                      },
                    ],
                    "role": "tool",
                  },
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "Hello, world!",
                        "type": "text",
                      },
                    ],
                    "role": "assistant",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:01.000Z,
              },
              "sources": [],
              "staticToolCalls": [],
              "staticToolResults": [],
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "thinking",
                      "type": "reasoning",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "VALUE",
                      },
                      "output": "RESULT1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "RESULT1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "finishReason": "stop",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "2",
                    },
                    "id": "id-1",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "RESULT1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "Hello, world!",
                            "type": "text",
                          },
                        ],
                        "role": "assistant",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:01.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": 3,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": 10,
                    "totalTokens": 23,
                  },
                  "warnings": [],
                },
              ],
              "text": "Hello, world!",
              "toolCalls": [],
              "toolResults": [],
              "totalUsage": {
                "cachedInputTokens": 3,
                "inputTokens": 6,
                "outputTokens": 20,
                "reasoningTokens": 10,
                "totalTokens": 36,
              },
              "usage": {
                "cachedInputTokens": 3,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": 10,
                "totalTokens": 23,
              },
              "warnings": [],
            }
          `);
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchInlineSnapshot(`
            [
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "value": "VALUE",
                    },
                    "output": "RESULT1",
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
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
                            "value": "RESULT1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "warnings": [],
              },
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "finishReason": "stop",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
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
                            "value": "RESULT1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "Hello, world!",
                          "type": "text",
                        },
                      ],
                      "role": "assistant",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
                "warnings": [],
              },
            ]
          `);
        });
      });

      describe('value promises', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('result.totalUsage should contain total token usage', async () => {
          expect(await result.totalUsage).toMatchInlineSnapshot(`
            {
              "cachedInputTokens": 3,
              "inputTokens": 6,
              "outputTokens": 20,
              "reasoningTokens": 10,
              "totalTokens": 36,
            }
          `);
        });

        it('result.usage should contain token usage from final step', async () => {
          expect(await result.totalUsage).toMatchInlineSnapshot(`
          {
            "cachedInputTokens": 3,
            "inputTokens": 6,
            "outputTokens": 20,
            "reasoningTokens": 10,
            "totalTokens": 36,
          }
        `);
        });

        it('result.finishReason should contain finish reason from final step', async () => {
          assert.strictEqual(await result.finishReason, 'stop');
        });

        it('result.text should contain text from final step', async () => {
          assert.strictEqual(await result.text, 'Hello, world!');
        });

        it('result.steps should contain all steps', async () => {
          expect(await result.steps).toMatchInlineSnapshot(`
            [
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "value": "VALUE",
                    },
                    "output": "RESULT1",
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
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
                            "value": "RESULT1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "warnings": [],
              },
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "finishReason": "stop",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
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
                            "value": "RESULT1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "Hello, world!",
                          "type": "text",
                        },
                      ],
                      "role": "assistant",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
                "warnings": [],
              },
            ]
          `);
        });

        it('result.response.messages should contain response messages from all steps', async () => {
          expect((await result.response).messages).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
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
                      "value": "RESULT1",
                    },
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "role": "assistant",
              },
            ]
          `);
        });
      });

      it('should record telemetry data for each step', async () => {
        await result.consumeStream();
        expect(tracer.jsonSpans).toMatchInlineSnapshot(`
          [
            {
              "attributes": {
                "ai.model.id": "mock-model-id",
                "ai.model.provider": "mock-provider",
                "ai.operationId": "ai.streamText",
                "ai.prompt": "{"prompt":"test-input"}",
                "ai.response.finishReason": "stop",
                "ai.response.text": "Hello, world!",
                "ai.settings.maxRetries": 2,
                "ai.usage.cachedInputTokens": 3,
                "ai.usage.inputTokens": 6,
                "ai.usage.outputTokens": 20,
                "ai.usage.reasoningTokens": 10,
                "ai.usage.totalTokens": 36,
                "operation.name": "ai.streamText",
              },
              "events": [],
              "name": "ai.streamText",
            },
            {
              "attributes": {
                "ai.model.id": "mock-model-id",
                "ai.model.provider": "mock-provider",
                "ai.operationId": "ai.streamText.doStream",
                "ai.prompt.messages": "[{"role":"user","content":[{"type":"text","text":"test-input"}]}]",
                "ai.prompt.toolChoice": "{"type":"auto"}",
                "ai.prompt.tools": [
                  "{"type":"function","name":"tool1","inputSchema":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false}}",
                ],
                "ai.response.avgOutputTokensPerSecond": 20,
                "ai.response.finishReason": "tool-calls",
                "ai.response.id": "id-0",
                "ai.response.model": "mock-model-id",
                "ai.response.msToFinish": 500,
                "ai.response.msToFirstChunk": 100,
                "ai.response.text": "",
                "ai.response.timestamp": "1970-01-01T00:00:00.000Z",
                "ai.response.toolCalls": "[{"type":"tool-call","toolCallId":"call-1","toolName":"tool1","input":{"value":"value"}}]",
                "ai.settings.maxRetries": 2,
                "ai.usage.inputTokens": 3,
                "ai.usage.outputTokens": 10,
                "ai.usage.totalTokens": 13,
                "gen_ai.request.model": "mock-model-id",
                "gen_ai.response.finish_reasons": [
                  "tool-calls",
                ],
                "gen_ai.response.id": "id-0",
                "gen_ai.response.model": "mock-model-id",
                "gen_ai.system": "mock-provider",
                "gen_ai.usage.input_tokens": 3,
                "gen_ai.usage.output_tokens": 10,
                "operation.name": "ai.streamText.doStream",
              },
              "events": [
                {
                  "attributes": {
                    "ai.response.msToFirstChunk": 100,
                  },
                  "name": "ai.stream.firstChunk",
                },
                {
                  "attributes": undefined,
                  "name": "ai.stream.finish",
                },
              ],
              "name": "ai.streamText.doStream",
            },
            {
              "attributes": {
                "ai.operationId": "ai.toolCall",
                "ai.toolCall.args": "{"value":"value"}",
                "ai.toolCall.id": "call-1",
                "ai.toolCall.name": "tool1",
                "ai.toolCall.result": ""result1"",
                "operation.name": "ai.toolCall",
              },
              "events": [],
              "name": "ai.toolCall",
            },
            {
              "attributes": {
                "ai.model.id": "mock-model-id",
                "ai.model.provider": "mock-provider",
                "ai.operationId": "ai.streamText.doStream",
                "ai.prompt.messages": "[{"role":"user","content":[{"type":"text","text":"test-input"}]},{"role":"assistant","content":[{"type":"reasoning","text":"thinking"},{"type":"tool-call","toolCallId":"call-1","toolName":"tool1","input":{"value":"value"}}]},{"role":"tool","content":[{"type":"tool-result","toolCallId":"call-1","toolName":"tool1","output":{"type":"text","value":"RESULT1"}}]}]",
                "ai.prompt.toolChoice": "{"type":"auto"}",
                "ai.prompt.tools": [
                  "{"type":"function","name":"tool1","inputSchema":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false}}",
                ],
                "ai.response.avgOutputTokensPerSecond": 25,
                "ai.response.finishReason": "stop",
                "ai.response.id": "id-1",
                "ai.response.model": "mock-model-id",
                "ai.response.msToFinish": 400,
                "ai.response.msToFirstChunk": 400,
                "ai.response.text": "Hello, world!",
                "ai.response.timestamp": "1970-01-01T00:00:01.000Z",
                "ai.settings.maxRetries": 2,
                "ai.usage.cachedInputTokens": 3,
                "ai.usage.inputTokens": 3,
                "ai.usage.outputTokens": 10,
                "ai.usage.reasoningTokens": 10,
                "ai.usage.totalTokens": 23,
                "gen_ai.request.model": "mock-model-id",
                "gen_ai.response.finish_reasons": [
                  "stop",
                ],
                "gen_ai.response.id": "id-1",
                "gen_ai.response.model": "mock-model-id",
                "gen_ai.system": "mock-provider",
                "gen_ai.usage.input_tokens": 3,
                "gen_ai.usage.output_tokens": 10,
                "operation.name": "ai.streamText.doStream",
              },
              "events": [
                {
                  "attributes": {
                    "ai.response.msToFirstChunk": 400,
                  },
                  "name": "ai.stream.firstChunk",
                },
                {
                  "attributes": undefined,
                  "name": "ai.stream.finish",
                },
              ],
              "name": "ai.streamText.doStream",
            },
          ]
        `);
      });

      it('should have correct ui message stream', async () => {
        expect(await convertReadableStreamToArray(result.toUIMessageStream()))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "type": "start-step",
              },
              {
                "id": "id-0",
                "type": "reasoning-start",
              },
              {
                "delta": "thinking",
                "id": "id-0",
                "type": "reasoning-delta",
              },
              {
                "id": "id-0",
                "type": "reasoning-end",
              },
              {
                "input": {
                  "value": "value",
                },
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-input-available",
              },
              {
                "output": "RESULT1",
                "toolCallId": "call-1",
                "type": "tool-output-available",
              },
              {
                "type": "finish-step",
              },
              {
                "type": "start-step",
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "delta": "Hello, ",
                "id": "1",
                "type": "text-delta",
              },
              {
                "delta": "world!",
                "id": "1",
                "type": "text-delta",
              },
              {
                "id": "1",
                "type": "text-end",
              },
              {
                "type": "finish-step",
              },
              {
                "type": "finish",
              },
            ]
          `);
      });
    });

    describe('2 stop conditions', () => {
      let stopConditionCalls: Array<{
        number: number;
        steps: StepResult<any>[];
      }>;

      beforeEach(async () => {
        stopConditionCalls = [];

        let responseCount = 0;
        result = streamText({
          model: new MockLanguageModelV2({
            doStream: async () => {
              switch (responseCount++) {
                case 0: {
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      {
                        type: 'reasoning-start',
                        id: 'id-0',
                      },
                      {
                        type: 'reasoning-delta',
                        id: 'id-0',
                        delta: 'thinking',
                      },
                      {
                        type: 'reasoning-end',
                        id: 'id-0',
                      },
                      {
                        type: 'tool-call',
                        id: 'call-1',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        input: `{ "value": "value" }`,
                      },
                      {
                        type: 'finish',
                        finishReason: 'tool-calls',
                        usage: testUsage,
                      },
                    ]),
                    response: { headers: { call: '1' } },
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
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          prompt: 'test-input',
          experimental_telemetry: { isEnabled: true, tracer },
          stopWhen: [
            ({ steps }) => {
              stopConditionCalls.push({ number: 0, steps });
              return false;
            },
            ({ steps }) => {
              stopConditionCalls.push({ number: 1, steps });
              return true;
            },
          ],
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
          },
        });
      });

      it('result.steps should contain a single step', async () => {
        await result.consumeStream();
        expect((await result.steps).length).toStrictEqual(1);
      });

      it('stopConditionCalls should be called for each stop condition', async () => {
        await result.consumeStream();
        expect(stopConditionCalls).toMatchInlineSnapshot(`
          [
            {
              "number": 0,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "thinking",
                      "type": "reasoning",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
              ],
            },
            {
              "number": 1,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "thinking",
                      "type": "reasoning",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
              ],
            },
          ]
        `);
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
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
                { type: 'text-delta', id: '1', delta: ', ' },
                { type: 'text-delta', id: '1', delta: `world!` },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
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

  describe('provider-executed tools', () => {
    describe('single provider-executed tool call and result', () => {
      let result: StreamTextResult<any, any>;

      beforeEach(async () => {
        result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'tool-input-start',
                id: 'call-1',
                toolName: 'web_search',
                providerExecuted: true,
              },
              {
                type: 'tool-input-delta',
                id: 'call-1',
                delta: '{ "value": "value" }',
              },
              {
                type: 'tool-input-end',
                id: 'call-1',
              },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'web_search',
                input: `{ "value": "value" }`,
                providerExecuted: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'web_search',
                result: `{ "value": "result1" }`,
                providerExecuted: true,
              },
              {
                type: 'tool-call',
                toolCallId: 'call-2',
                toolName: 'web_search',
                input: `{ "value": "value" }`,
                providerExecuted: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'call-2',
                toolName: 'web_search',
                result: `ERROR`,
                isError: true,
                providerExecuted: true,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          }),
          tools: {
            web_search: {
              type: 'provider-defined',
              id: 'test.web_search',
              name: 'web_search',
              inputSchema: z.object({ value: z.string() }),
              outputSchema: z.object({ value: z.string() }),
              args: {},
            },
          },
          ...defaultSettings(),
          stopWhen: stepCountIs(4),
        });
      });

      it('should only execute a single step', async () => {
        await result.consumeStream();
        expect((await result.steps).length).toBe(1);
      });

      it('should include provider-executed tool call and result content', async () => {
        await result.consumeStream();
        expect(await result.content).toMatchInlineSnapshot(`
          [
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": true,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "web_search",
              "type": "tool-call",
            },
            {
              "input": {
                "value": "value",
              },
              "output": "{ "value": "result1" }",
              "providerExecuted": true,
              "toolCallId": "call-1",
              "toolName": "web_search",
              "type": "tool-result",
            },
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": true,
              "providerMetadata": undefined,
              "toolCallId": "call-2",
              "toolName": "web_search",
              "type": "tool-call",
            },
            {
              "error": "ERROR",
              "input": {
                "value": "value",
              },
              "providerExecuted": true,
              "toolCallId": "call-2",
              "toolName": "web_search",
              "type": "tool-error",
            },
          ]
        `);
      });

      it('should include provider-executed tool call and result in the full stream', async () => {
        expect(await convertAsyncIterableToArray(result.fullStream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "dynamic": false,
                "id": "call-1",
                "providerExecuted": true,
                "toolName": "web_search",
                "type": "tool-input-start",
              },
              {
                "delta": "{ "value": "value" }",
                "id": "call-1",
                "type": "tool-input-delta",
              },
              {
                "id": "call-1",
                "type": "tool-input-end",
              },
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": true,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "web_search",
                "type": "tool-call",
              },
              {
                "input": {
                  "value": "value",
                },
                "output": "{ "value": "result1" }",
                "providerExecuted": true,
                "toolCallId": "call-1",
                "toolName": "web_search",
                "type": "tool-result",
              },
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": true,
                "providerMetadata": undefined,
                "toolCallId": "call-2",
                "toolName": "web_search",
                "type": "tool-call",
              },
              {
                "error": "ERROR",
                "input": {
                  "value": "value",
                },
                "providerExecuted": true,
                "toolCallId": "call-2",
                "toolName": "web_search",
                "type": "tool-error",
              },
              {
                "finishReason": "stop",
                "providerMetadata": undefined,
                "response": {
                  "headers": undefined,
                  "id": "id-0",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
              },
              {
                "finishReason": "stop",
                "totalUsage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "type": "finish",
              },
            ]
          `);
      });

      it('should include provider-executed tool call and result in the ui message stream', async () => {
        expect(await convertReadableStreamToArray(result.toUIMessageStream()))
          .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "providerExecuted": true,
              "toolCallId": "call-1",
              "toolName": "web_search",
              "type": "tool-input-start",
            },
            {
              "inputTextDelta": "{ "value": "value" }",
              "toolCallId": "call-1",
              "type": "tool-input-delta",
            },
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": true,
              "toolCallId": "call-1",
              "toolName": "web_search",
              "type": "tool-input-available",
            },
            {
              "output": "{ "value": "result1" }",
              "providerExecuted": true,
              "toolCallId": "call-1",
              "type": "tool-output-available",
            },
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": true,
              "toolCallId": "call-2",
              "toolName": "web_search",
              "type": "tool-input-available",
            },
            {
              "errorText": "ERROR",
              "providerExecuted": true,
              "toolCallId": "call-2",
              "type": "tool-output-error",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
      });
    });
  });

  describe('dynamic tools', () => {
    describe('single dynamic tool call and result', () => {
      let result: StreamTextResult<any, any>;

      beforeEach(async () => {
        result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              {
                type: 'tool-input-start',
                id: 'call-1',
                toolName: 'dynamicTool',
              },
              {
                type: 'tool-input-delta',
                id: 'call-1',
                delta: '{ "value": "value" }',
              },
              {
                type: 'tool-input-end',
                id: 'call-1',
              },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'dynamicTool',
                input: `{ "value": "value" }`,
              },
              {
                type: 'finish',
                finishReason: 'tool-calls',
                usage: testUsage,
              },
            ]),
          }),
          tools: {
            dynamicTool: dynamicTool({
              inputSchema: z.object({ value: z.string() }),
              execute: async () => {
                return { value: 'test-result' };
              },
            }),
          },
          ...defaultSettings(),
        });
      });

      it('should include dynamic tool call and result content', async () => {
        await result.consumeStream();
        expect(await result.content).toMatchInlineSnapshot(`
          [
            {
              "dynamic": true,
              "input": {
                "value": "value",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "dynamicTool",
              "type": "tool-call",
            },
            {
              "dynamic": true,
              "input": {
                "value": "value",
              },
              "output": {
                "value": "test-result",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "dynamicTool",
              "type": "tool-result",
            },
          ]
        `);
      });

      it('should include dynamic tool call and result in the full stream', async () => {
        expect(await convertAsyncIterableToArray(result.fullStream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "dynamic": true,
                "id": "call-1",
                "toolName": "dynamicTool",
                "type": "tool-input-start",
              },
              {
                "delta": "{ "value": "value" }",
                "id": "call-1",
                "type": "tool-input-delta",
              },
              {
                "id": "call-1",
                "type": "tool-input-end",
              },
              {
                "dynamic": true,
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "dynamicTool",
                "type": "tool-call",
              },
              {
                "dynamic": true,
                "input": {
                  "value": "value",
                },
                "output": {
                  "value": "test-result",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "dynamicTool",
                "type": "tool-result",
              },
              {
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "response": {
                  "headers": undefined,
                  "id": "id-0",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
              },
              {
                "finishReason": "tool-calls",
                "totalUsage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "type": "finish",
              },
            ]
          `);
      });

      it('should include dynamic tool call and result in the ui message stream', async () => {
        expect(await convertReadableStreamToArray(result.toUIMessageStream()))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "type": "start-step",
              },
              {
                "dynamic": true,
                "toolCallId": "call-1",
                "toolName": "dynamicTool",
                "type": "tool-input-start",
              },
              {
                "inputTextDelta": "{ "value": "value" }",
                "toolCallId": "call-1",
                "type": "tool-input-delta",
              },
              {
                "dynamic": true,
                "input": {
                  "value": "value",
                },
                "toolCallId": "call-1",
                "toolName": "dynamicTool",
                "type": "tool-input-available",
              },
              {
                "dynamic": true,
                "output": {
                  "value": "test-result",
                },
                "toolCallId": "call-1",
                "type": "tool-output-available",
              },
              {
                "type": "finish-step",
              },
              {
                "type": "finish",
              },
            ]
          `);
      });
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
                { type: 'text-start', id: '1' },
                {
                  type: 'text-delta',
                  id: '1',
                  delta: 'provider metadata test',
                },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
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
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
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
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
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

    it('should record error on tool call', async () => {
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
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => {
              throw new Error('Tool execution failed');
            },
          },
        },
        prompt: 'test-input',
        experimental_telemetry: { isEnabled: true, tracer },
        _internal: { now: mockValues(0, 100, 500) },
      });

      await result.consumeStream();

      expect(tracer.jsonSpans).toHaveLength(3);

      // Check that we have the expected spans
      expect(tracer.jsonSpans[0].name).toBe('ai.streamText');
      expect(tracer.jsonSpans[1].name).toBe('ai.streamText.doStream');
      expect(tracer.jsonSpans[2].name).toBe('ai.toolCall');

      // Check that the tool call span has error status
      const toolCallSpan = tracer.jsonSpans[2];
      expect(toolCallSpan.status).toEqual({
        code: 2,
        message: 'Tool execution failed',
      });

      // Check that the tool call span has exception event
      expect(toolCallSpan.events).toHaveLength(1);
      const exceptionEvent = toolCallSpan.events[0];
      expect(exceptionEvent.name).toBe('exception');
      expect(exceptionEvent.attributes).toMatchObject({
        'exception.message': 'Tool execution failed',
        'exception.name': 'Error',
      });
      expect(exceptionEvent.attributes?.['exception.stack']).toContain(
        'Tool execution failed',
      );
      expect(exceptionEvent.time).toEqual([0, 0]);
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
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
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

  describe('tool callbacks', () => {
    it('should invoke callbacks in the correct order', async () => {
      const recordedCalls: unknown[] = [];

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
              type: 'tool-input-start',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolName: 'test-tool',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: '{"',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: 'value',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: '":"',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: 'Spark',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: 'le',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: ' Day',
            },
            {
              type: 'tool-input-delta',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              delta: '"}',
            },
            {
              type: 'tool-input-end',
              id: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
            },
            {
              type: 'tool-call',
              toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
              toolName: 'test-tool',
              input: '{"value":"Sparkle Day"}',
            },
            {
              type: 'finish',
              finishReason: 'tool-calls',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          'test-tool': tool({
            inputSchema: jsonSchema<{ value: string }>({
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
            }),
            onInputAvailable: options => {
              recordedCalls.push({ type: 'onInputAvailable', options });
            },
            onInputStart: options => {
              recordedCalls.push({ type: 'onInputStart', options });
            },
            onInputDelta: options => {
              recordedCalls.push({ type: 'onInputDelta', options });
            },
          }),
        },
        toolChoice: 'required',
        prompt: 'test-input',
        _internal: {
          now: mockValues(0, 100, 500),
        },
      });

      await result.consumeStream();

      expect(recordedCalls).toMatchInlineSnapshot(`
        [
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
            },
            "type": "onInputStart",
          },
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "inputTextDelta": "{"",
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
            },
            "type": "onInputDelta",
          },
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "inputTextDelta": "value",
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
            },
            "type": "onInputDelta",
          },
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "inputTextDelta": "":"",
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
            },
            "type": "onInputDelta",
          },
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "inputTextDelta": "Spark",
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
            },
            "type": "onInputDelta",
          },
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "inputTextDelta": "le",
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
            },
            "type": "onInputDelta",
          },
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "inputTextDelta": " Day",
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
            },
            "type": "onInputDelta",
          },
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "inputTextDelta": ""}",
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
            },
            "type": "onInputDelta",
          },
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "input": {
                "value": "Sparkle Day",
              },
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call_O17Uplv4lJvD6DVdIvFFeRMw",
            },
            "type": "onInputAvailable",
          },
        ]
      `);
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
                inputSchema: {
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
                providerOptions: undefined,
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
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: `{ "value": "value" }`,
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
                },
              ]),
            };
          },
        }),
        tools: {
          tool1: {
            inputSchema: jsonSchema<{ value: string }>({
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
    it('should support models that use "this" context in supportedUrls', async () => {
      let supportedUrlsCalled = false;
      class MockLanguageModelWithImageSupport extends MockLanguageModelV2 {
        constructor() {
          super({
            supportedUrls() {
              supportedUrlsCalled = true;
              // Reference 'this' to verify context
              return this.modelId === 'mock-model-id'
                ? ({ 'image/*': [/^https:\/\/.*$/] } as Record<
                    string,
                    RegExp[]
                  >)
                : {};
            },
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
                { type: 'text-delta', id: '1', delta: ', ' },
                { type: 'text-delta', id: '1', delta: 'world!' },
                { type: 'text-end', id: '1' },
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

      expect(supportedUrlsCalled).toBe(true);
      expect(await result.text).toBe('Hello, world!');
    });
  });

  describe('tool execution errors', () => {
    let result: StreamTextResult<any, any>;

    beforeEach(async () => {
      result = streamText({
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
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw new Error('test error');
            },
          }),
        },
        ...defaultSettings(),
      });
    });

    it('should include tool error part in the full stream', async () => {
      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            {
              "error": [Error: test error],
              "input": {
                "value": "value",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-error",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
            },
            {
              "finishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "type": "finish",
            },
          ]
        `);
    });

    it('should include the error part in the step stream', async () => {
      await result.consumeStream();

      expect(await result.steps).toMatchInlineSnapshot(`
        [
          DefaultStepResult {
            "content": [
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
              {
                "error": [Error: test error],
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-error",
              },
            ],
            "finishReason": "stop",
            "providerMetadata": undefined,
            "request": {},
            "response": {
              "headers": undefined,
              "id": "id-0",
              "messages": [
                {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                  ],
                  "role": "assistant",
                },
                {
                  "content": [
                    {
                      "output": {
                        "type": "error-text",
                        "value": "test error",
                      },
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "role": "tool",
                },
              ],
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
            "warnings": [],
          },
        ]
      `);
    });

    it('should include error result in response messages', async () => {
      await result.consumeStream();

      expect((await result.response).messages).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerOptions": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "error-text",
                  "value": "test error",
                },
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
    });

    it('should add tool-error parts to ui message stream', async () => {
      expect(await convertReadableStreamToArray(result.toUIMessageStream()))
        .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "input": {
                "value": "value",
              },
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-input-available",
            },
            {
              "errorText": "test error",
              "toolCallId": "call-1",
              "type": "tool-output-error",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
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
            if (
              chunk.type === 'text-delta' ||
              chunk.type === 'reasoning-delta'
            ) {
              chunk.text = chunk.text.toUpperCase();
            }

            if (chunk.type === 'tool-input-delta') {
              chunk.delta = chunk.delta.toUpperCase();
            }

            // assuming test arg structure:
            if (chunk.type === 'tool-call' && !chunk.dynamic) {
              chunk.input = {
                ...chunk.input,
                value: chunk.input.value.toUpperCase(),
              };
            }

            if (chunk.type === 'tool-result' && !chunk.dynamic) {
              chunk.output = chunk.output.toUpperCase();
              chunk.input = {
                ...chunk.input,
                value: chunk.input.value.toUpperCase(),
              };
            }

            if (chunk.type === 'start-step') {
              if (chunk.request.body != null) {
                chunk.request.body = (
                  chunk.request.body as string
                ).toUpperCase();
              }
            }

            if (chunk.type === 'finish-step') {
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
              content: [
                {
                  providerOptions: undefined,
                  text: 'HELLO, WORLD!',
                  type: 'text',
                },
              ],
            },
          ],
        });
      });

      it('result.totalUsage should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          }),
          experimental_transform: () =>
            new TransformStream<TextStreamPart<any>, TextStreamPart<any>>({
              transform(chunk, controller) {
                if (chunk.type === 'finish') {
                  chunk.totalUsage = {
                    inputTokens: 200,
                    outputTokens: 300,
                    totalTokens: undefined,
                    reasoningTokens: undefined,
                    cachedInputTokens: undefined,
                  };
                }
                controller.enqueue(chunk);
              },
            }),
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.totalUsage).toStrictEqual({
          inputTokens: 200,
          outputTokens: 300,
          totalTokens: undefined,
          reasoningTokens: undefined,
          cachedInputTokens: undefined,
        });
      });

      it('result.finishReason should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'length',
                usage: testUsage,
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello, ' },
              { type: 'text-delta', id: '1', delta: 'world!' },
              { type: 'text-end', id: '1' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          }),
          tools: {
            tool1: {
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseTransform,
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.toolCalls).toMatchInlineSnapshot(`
          [
            {
              "input": {
                "value": "VALUE",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
          ]
        `);
      });

      it('result.toolResults should be transformed', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello, ' },
              { type: 'text-delta', id: '1', delta: 'world!' },
              { type: 'text-end', id: '1' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          }),
          tools: {
            tool1: {
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseTransform,
          prompt: 'test-input',
        });

        await result.consumeStream();

        expect(await result.toolResults).toMatchInlineSnapshot(`
          [
            {
              "input": {
                "value": "VALUE",
              },
              "output": "RESULT1",
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          ]
        `);
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello, ' },
              { type: 'text-delta', id: '1', delta: 'world!' },
              { type: 'text-end', id: '1' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          }),
          tools: {
            tool1: {
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseTransform,
          prompt: 'test-input',
        });

        result.consumeStream();

        expect(await result.steps).toMatchInlineSnapshot(`
          [
            DefaultStepResult {
              "content": [
                {
                  "providerMetadata": undefined,
                  "text": "HELLO, WORLD!",
                  "type": "text",
                },
                {
                  "input": {
                    "value": "VALUE",
                  },
                  "providerExecuted": undefined,
                  "providerMetadata": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-call",
                },
                {
                  "input": {
                    "value": "VALUE",
                  },
                  "output": "RESULT1",
                  "providerExecuted": undefined,
                  "providerMetadata": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-result",
                },
              ],
              "finishReason": "stop",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "headers": undefined,
                "id": "id-0",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "HELLO, WORLD!",
                        "type": "text",
                      },
                      {
                        "input": {
                          "value": "VALUE",
                        },
                        "providerExecuted": undefined,
                        "providerOptions": undefined,
                        "toolCallId": "call-1",
                        "toolName": "tool1",
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
                          "value": "RESULT1",
                        },
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-result",
                      },
                    ],
                    "role": "tool",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "warnings": [],
            },
          ]
        `);
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-delta', id: '1', delta: ', ' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
              { type: 'text-delta', id: '1', delta: 'world!' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
                providerMetadata: {
                  testProvider: { testKey: 'testValue' },
                },
              },
            ]),
            response: { headers: { call: '2' } },
          }),
          tools: {
            tool1: {
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            },
          },
          prompt: 'test-input',
          onFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_transform: upperCaseTransform,
        });

        await resultObject.consumeStream();

        expect(result).toMatchInlineSnapshot(`
          {
            "content": [
              {
                "providerMetadata": undefined,
                "text": "HELLO, WORLD!",
                "type": "text",
              },
              {
                "input": {
                  "value": "VALUE",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
              {
                "input": {
                  "value": "VALUE",
                },
                "output": "VALUE-RESULT",
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
            ],
            "dynamicToolCalls": [],
            "dynamicToolResults": [],
            "files": [],
            "finishReason": "stop",
            "providerMetadata": {
              "testProvider": {
                "testKey": "TEST VALUE",
              },
            },
            "reasoning": [],
            "reasoningText": undefined,
            "request": {},
            "response": {
              "headers": {
                "call": "2",
              },
              "id": "id-0",
              "messages": [
                {
                  "content": [
                    {
                      "providerOptions": undefined,
                      "text": "HELLO, WORLD!",
                      "type": "text",
                    },
                    {
                      "input": {
                        "value": "VALUE",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
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
                        "value": "VALUE-RESULT",
                      },
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "role": "tool",
                },
              ],
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "sources": [],
            "staticToolCalls": [],
            "staticToolResults": [],
            "steps": [
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "HELLO, WORLD!",
                    "type": "text",
                  },
                  {
                    "input": {
                      "value": "VALUE",
                    },
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "value": "VALUE",
                    },
                    "output": "VALUE-RESULT",
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "finishReason": "stop",
                "providerMetadata": {
                  "testProvider": {
                    "testKey": "TEST VALUE",
                  },
                },
                "request": {},
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-0",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "HELLO, WORLD!",
                          "type": "text",
                        },
                        {
                          "input": {
                            "value": "VALUE",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
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
                            "value": "VALUE-RESULT",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "warnings": [],
              },
            ],
            "text": "HELLO, WORLD!",
            "toolCalls": [
              {
                "input": {
                  "value": "VALUE",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
            ],
            "toolResults": [
              {
                "input": {
                  "value": "VALUE",
                },
                "output": "VALUE-RESULT",
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
            ],
            "totalUsage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
            "warnings": [],
          }
        `);
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-delta', id: '1', delta: ', ' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
              { type: 'text-delta', id: '1', delta: 'world!' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
                providerMetadata: {
                  testProvider: { testKey: 'testValue' },
                },
              },
            ]),
            response: { headers: { call: '2' } },
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            }),
          },
          prompt: 'test-input',
          onStepFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_transform: upperCaseTransform,
        });

        await resultObject.consumeStream();

        expect(result).toMatchInlineSnapshot(`
          DefaultStepResult {
            "content": [
              {
                "providerMetadata": undefined,
                "text": "HELLO, WORLD!",
                "type": "text",
              },
              {
                "input": {
                  "value": "VALUE",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
              {
                "input": {
                  "value": "VALUE",
                },
                "output": "VALUE-RESULT",
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
            ],
            "finishReason": "stop",
            "providerMetadata": {
              "testProvider": {
                "testKey": "TEST VALUE",
              },
            },
            "request": {},
            "response": {
              "headers": {
                "call": "2",
              },
              "id": "id-0",
              "messages": [
                {
                  "content": [
                    {
                      "providerOptions": undefined,
                      "text": "HELLO, WORLD!",
                      "type": "text",
                    },
                    {
                      "input": {
                        "value": "VALUE",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
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
                        "value": "VALUE-RESULT",
                      },
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "role": "tool",
                },
              ],
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
            "warnings": [],
          }
        `);
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-delta', id: '1', delta: ', ' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
              { type: 'text-delta', id: '1', delta: 'world!' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
                providerMetadata: {
                  testProvider: { testKey: 'testValue' },
                },
              },
            ]),
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
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
                | 'text-delta'
                | 'reasoning-delta'
                | 'source'
                | 'tool-call'
                | 'tool-input-start'
                | 'tool-input-delta'
                | 'tool-result'
                | 'raw';
            }
          >
        > = [];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'reasoning-start', id: '2' },
              { type: 'reasoning-delta', id: '2', delta: 'Feeling clever' },
              { type: 'reasoning-end', id: '2' },
              { type: 'tool-input-start', id: 'call-1', toolName: 'tool1' },
              { type: 'tool-input-delta', id: 'call-1', delta: '{"value": "' },
              { type: 'tool-input-delta', id: 'call-1', delta: 'test' },
              { type: 'tool-input-delta', id: 'call-1', delta: '"}' },
              { type: 'tool-input-end', id: 'call-1' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "test" }`,
              },
              { type: 'text-delta', id: '1', delta: ' World' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          }),
          tools: {
            tool1: {
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            },
          },
          prompt: 'test-input',
          onChunk(event) {
            result.push(event.chunk);
          },
          experimental_transform: upperCaseTransform,
        });

        await resultObject.consumeStream();

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "HELLO",
              "type": "text-delta",
            },
            {
              "id": "2",
              "providerMetadata": undefined,
              "text": "FEELING CLEVER",
              "type": "reasoning-delta",
            },
            {
              "dynamic": false,
              "id": "call-1",
              "toolName": "tool1",
              "type": "tool-input-start",
            },
            {
              "delta": "{"VALUE": "",
              "id": "call-1",
              "type": "tool-input-delta",
            },
            {
              "delta": "TEST",
              "id": "call-1",
              "type": "tool-input-delta",
            },
            {
              "delta": ""}",
              "id": "call-1",
              "type": "tool-input-delta",
            },
            {
              "input": {
                "value": "TEST",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            {
              "input": {
                "value": "TEST",
              },
              "output": "TEST-RESULT",
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": " WORLD",
              "type": "text-delta",
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
              if (chunk.type !== 'text-delta') {
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
              if (chunk.type !== 'text-delta') {
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
              if (chunk.type !== 'text-delta') {
                controller.enqueue(chunk);
                return;
              }

              if (chunk.text.includes('STOP')) {
                stopStream();

                controller.enqueue({
                  type: 'finish-step',
                  finishReason: 'stop',
                  providerMetadata: undefined,
                  usage: {
                    inputTokens: undefined,
                    outputTokens: undefined,
                    totalTokens: undefined,
                    reasoningTokens: undefined,
                    cachedInputTokens: undefined,
                  },
                  response: {
                    id: 'response-id',
                    modelId: 'mock-model-id',
                    timestamp: new Date(0),
                  },
                });

                controller.enqueue({
                  type: 'finish',
                  finishReason: 'stop',
                  totalUsage: {
                    inputTokens: undefined,
                    outputTokens: undefined,
                    totalTokens: undefined,
                    reasoningTokens: undefined,
                    cachedInputTokens: undefined,
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello, ' },
              { type: 'text-delta', id: '1', delta: 'STOP' },
              { type: 'text-delta', id: '1', delta: ' World' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                  inputTokens: undefined,
                  outputTokens: undefined,
                  totalTokens: undefined,
                  reasoningTokens: undefined,
                  cachedInputTokens: undefined,
                },
              },
            ]),
          }),
          prompt: 'test-input',
          experimental_transform: stopWordTransform(),
        });

        expect(await convertAsyncIterableToArray(result.fullStream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "Hello, ",
                "type": "text-delta",
              },
              {
                "finishReason": "stop",
                "providerMetadata": undefined,
                "response": {
                  "id": "response-id",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": undefined,
                  "outputTokens": undefined,
                  "reasoningTokens": undefined,
                  "totalTokens": undefined,
                },
              },
              {
                "finishReason": "stop",
                "totalUsage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": undefined,
                  "outputTokens": undefined,
                  "reasoningTokens": undefined,
                  "totalTokens": undefined,
                },
                "type": "finish",
              },
            ]
          `);
      });

      it('options.onStepFinish should be called', async () => {
        let result!: Parameters<
          Required<Parameters<typeof streamText>[0]>['onStepFinish']
        >[0];

        const resultObject = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello, ' },
              { type: 'text-delta', id: '1', delta: 'STOP' },
              { type: 'text-delta', id: '1', delta: ' World' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          }),
          prompt: 'test-input',
          onStepFinish: async event => {
            result = event as unknown as typeof result;
          },
          experimental_transform: stopWordTransform(),
        });

        await resultObject.consumeStream();

        expect(result).toMatchInlineSnapshot(`
          DefaultStepResult {
            "content": [
              {
                "providerMetadata": undefined,
                "text": "Hello, ",
                "type": "text",
              },
            ],
            "finishReason": "stop",
            "providerMetadata": undefined,
            "request": {},
            "response": {
              "id": "response-id",
              "messages": [
                {
                  "content": [
                    {
                      "providerOptions": undefined,
                      "text": "Hello, ",
                      "type": "text",
                    },
                  ],
                  "role": "assistant",
                },
              ],
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": undefined,
              "outputTokens": undefined,
              "reasoningTokens": undefined,
              "totalTokens": undefined,
            },
            "warnings": [],
          }
        `);
      });
    });
  });

  describe('options.output', () => {
    describe('no output', () => {
      it('should throw error when accessing partial output stream', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: '{ ' },
              { type: 'text-delta', id: '1', delta: '"value": ' },
              { type: 'text-delta', id: '1', delta: `"Hello, ` },
              { type: 'text-delta', id: '1', delta: `world` },
              { type: 'text-delta', id: '1', delta: `!"` },
              { type: 'text-delta', id: '1', delta: ' }' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello, ' },
              { type: 'text-delta', id: '1', delta: ',' },
              { type: 'text-delta', id: '1', delta: ' world!' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
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
            doStream: async args => {
              callOptions = args;
              return {
                stream: convertArrayToReadableStream([
                  { type: 'text-start', id: '1' },
                  { type: 'text-delta', id: '1', delta: '{ ' },
                  { type: 'text-delta', id: '1', delta: '"value": ' },
                  { type: 'text-delta', id: '1', delta: `"Hello, ` },
                  { type: 'text-delta', id: '1', delta: `world` },
                  { type: 'text-delta', id: '1', delta: `!"` },
                  { type: 'text-delta', id: '1', delta: ' }' },
                  { type: 'text-end', id: '1' },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: testUsage,
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

        expect(callOptions).toMatchInlineSnapshot(`
          {
            "abortSignal": undefined,
            "frequencyPenalty": undefined,
            "headers": undefined,
            "includeRawChunks": false,
            "maxOutputTokens": undefined,
            "presencePenalty": undefined,
            "prompt": [
              {
                "content": [
                  {
                    "text": "prompt",
                    "type": "text",
                  },
                ],
                "providerOptions": undefined,
                "role": "user",
              },
            ],
            "providerOptions": undefined,
            "responseFormat": {
              "schema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "additionalProperties": false,
                "properties": {
                  "value": {
                    "type": "string",
                  },
                },
                "required": [
                  "value",
                ],
                "type": "object",
              },
              "type": "json",
            },
            "seed": undefined,
            "stopSequences": undefined,
            "temperature": undefined,
            "toolChoice": undefined,
            "tools": undefined,
            "topK": undefined,
            "topP": undefined,
          }
        `);
      });

      it('should send valid partial text fragments', async () => {
        const result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: '{ ' },
              { type: 'text-delta', id: '1', delta: '"value": ' },
              { type: 'text-delta', id: '1', delta: `"Hello, ` },
              { type: 'text-delta', id: '1', delta: `world` },
              { type: 'text-delta', id: '1', delta: `!"` },
              { type: 'text-delta', id: '1', delta: ' }' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: '{ ' },
              { type: 'text-delta', id: '1', delta: '"value": ' },
              { type: 'text-delta', id: '1', delta: `"Hello, ` },
              { type: 'text-delta', id: '1', delta: `world` },
              { type: 'text-delta', id: '1', delta: `!"` },
              { type: 'text-delta', id: '1', delta: ' }' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: '{ ' },
              { type: 'text-delta', id: '1', delta: '"value": ' },
              { type: 'text-delta', id: '1', delta: `"Hello, ` },
              { type: 'text-delta', id: '1', delta: `world!" }` },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: '{ ' },
              { type: 'text-delta', id: '1', delta: '"value": ' },
              { type: 'text-delta', id: '1', delta: `"Hello, ` },
              { type: 'text-delta', id: '1', delta: `world!" ` },
              { type: 'text-delta', id: '1', delta: '}' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
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
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: '{ ' },
              { type: 'text-delta', id: '1', delta: '"value": ' },
              { type: 'text-delta', id: '1', delta: `"Hello, ` },
              { type: 'text-delta', id: '1', delta: `world!" ` },
              { type: 'text-delta', id: '1', delta: '}' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
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
          _internal: {
            generateId: mockId({ prefix: 'id' }),
            currentDate: () => new Date(0),
          },
        });

        resultObject.consumeStream();

        await resultObject.consumeStream();

        expect(result).toMatchInlineSnapshot(`
          {
            "content": [
              {
                "providerMetadata": undefined,
                "text": "{ "value": "Hello, world!" }",
                "type": "text",
              },
            ],
            "dynamicToolCalls": [],
            "dynamicToolResults": [],
            "files": [],
            "finishReason": "stop",
            "providerMetadata": undefined,
            "reasoning": [],
            "reasoningText": undefined,
            "request": {},
            "response": {
              "headers": undefined,
              "id": "id-0",
              "messages": [
                {
                  "content": [
                    {
                      "providerOptions": undefined,
                      "text": "{ "value": "Hello, world!" }",
                      "type": "text",
                    },
                  ],
                  "role": "assistant",
                },
              ],
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "sources": [],
            "staticToolCalls": [],
            "staticToolResults": [],
            "steps": [
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "{ "value": "Hello, world!" }",
                    "type": "text",
                  },
                ],
                "finishReason": "stop",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": undefined,
                  "id": "id-0",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "{ "value": "Hello, world!" }",
                          "type": "text",
                        },
                      ],
                      "role": "assistant",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "warnings": [],
              },
            ],
            "text": "{ "value": "Hello, world!" }",
            "toolCalls": [],
            "toolResults": [],
            "totalUsage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
            "warnings": [],
          }
        `);
      });
    });
  });

  describe('options.activeTools', () => {
    it('should filter available tools to only the ones in activeTools', async () => {
      let tools:
        | (LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool)[]
        | undefined;

      const result = streamText({
        model: new MockLanguageModelV2({
          doStream: async ({ tools: toolsArg }) => {
            tools = toolsArg;

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
                { type: 'text-delta', id: '1', delta: ', ' },
                { type: 'text-delta', id: '1', delta: `world!` },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
                },
              ]),
            };
          },
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
          tool2: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result2',
          },
        },
        prompt: 'test-input',
        activeTools: ['tool1'],
      });

      await result.consumeStream();

      expect(tools).toMatchInlineSnapshot(`
        [
          {
            "description": undefined,
            "inputSchema": {
              "$schema": "http://json-schema.org/draft-07/schema#",
              "additionalProperties": false,
              "properties": {
                "value": {
                  "type": "string",
                },
              },
              "required": [
                "value",
              ],
              "type": "object",
            },
            "name": "tool1",
            "providerOptions": undefined,
            "type": "function",
          },
        ]
      `);
    });
  });

  describe('raw chunks forwarding', () => {
    it('should forward raw chunks when includeRawChunks is enabled', async () => {
      const modelWithRawChunks = createTestModel({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'raw',
            rawValue: {
              type: 'raw-data',
              content: 'should appear',
            },
          },
          {
            type: 'response-metadata',
            id: 'test-id',
            modelId: 'test-model',
            timestamp: new Date(0),
          },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'Hello, world!' },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: 'stop',
            usage: testUsage,
          },
        ]),
      });

      const result = streamText({
        model: modelWithRawChunks,
        prompt: 'test prompt',
        includeRawChunks: true,
      });

      const chunks = await convertAsyncIterableToArray(result.fullStream);

      expect(chunks.filter(chunk => chunk.type === 'raw'))
        .toMatchInlineSnapshot(`
          [
            {
              "rawValue": {
                "content": "should appear",
                "type": "raw-data",
              },
              "type": "raw",
            },
          ]
        `);
    });

    it('should not forward raw chunks when includeRawChunks is disabled', async () => {
      const modelWithRawChunks = createTestModel({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'raw',
            rawValue: {
              type: 'raw-data',
              content: 'should not appear',
            },
          },
          {
            type: 'response-metadata',
            id: 'test-id',
            modelId: 'test-model',
            timestamp: new Date(0),
          },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'Hello, world!' },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: 'stop',
            usage: testUsage,
          },
        ]),
      });

      const result = streamText({
        model: modelWithRawChunks,
        prompt: 'test prompt',
        includeRawChunks: false,
      });

      const chunks = await convertAsyncIterableToArray(result.fullStream);

      expect(chunks.filter(chunk => chunk.type === 'raw')).toHaveLength(0);
    });

    it('should pass through the includeRawChunks flag correctly to the model', async () => {
      let capturedOptions: any;

      const model = new MockLanguageModelV2({
        doStream: async options => {
          capturedOptions = options;

          return {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              { type: 'finish', finishReason: 'stop', usage: testUsage },
            ]),
          };
        },
      });

      await streamText({
        model,
        prompt: 'test prompt',
        includeRawChunks: true,
      }).consumeStream();

      expect(capturedOptions.includeRawChunks).toBe(true);
    });

    it('should call onChunk with raw chunks when includeRawChunks is enabled', async () => {
      const onChunkCalls: Array<any> = [];

      const modelWithRawChunks = createTestModel({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'raw',
            rawValue: { type: 'stream-start', data: 'start' },
          },
          {
            type: 'raw',
            rawValue: {
              type: 'response-metadata',
              id: 'test-id',
              modelId: 'test-model',
            },
          },
          {
            type: 'raw',
            rawValue: { type: 'text-delta', content: 'Hello' },
          },
          {
            type: 'raw',
            rawValue: { type: 'text-delta', content: ', world!' },
          },
          {
            type: 'raw',
            rawValue: { type: 'finish', reason: 'stop' },
          },
          {
            type: 'response-metadata',
            id: 'test-id',
            modelId: 'test-model',
            timestamp: new Date(0),
          },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'Hello, world!' },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: 'stop',
            usage: testUsage,
          },
        ]),
      });

      const result = streamText({
        model: modelWithRawChunks,
        prompt: 'test prompt',
        includeRawChunks: true,
        onChunk({ chunk }) {
          onChunkCalls.push(chunk);
        },
      });

      await result.consumeStream();

      expect(onChunkCalls).toMatchInlineSnapshot(`
        [
          {
            "rawValue": {
              "data": "start",
              "type": "stream-start",
            },
            "type": "raw",
          },
          {
            "rawValue": {
              "id": "test-id",
              "modelId": "test-model",
              "type": "response-metadata",
            },
            "type": "raw",
          },
          {
            "rawValue": {
              "content": "Hello",
              "type": "text-delta",
            },
            "type": "raw",
          },
          {
            "rawValue": {
              "content": ", world!",
              "type": "text-delta",
            },
            "type": "raw",
          },
          {
            "rawValue": {
              "reason": "stop",
              "type": "finish",
            },
            "type": "raw",
          },
          {
            "id": "1",
            "providerMetadata": undefined,
            "text": "Hello, world!",
            "type": "text-delta",
          },
        ]
      `);
    });

    it('should pass includeRawChunks flag correctly to the model', async () => {
      let capturedOptions: any;

      const model = new MockLanguageModelV2({
        doStream: async options => {
          capturedOptions = options;
          return {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              {
                type: 'response-metadata',
                id: 'test-id',
                modelId: 'test-model',
                timestamp: new Date(0),
              },
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          };
        },
      });

      await streamText({
        model,
        prompt: 'test prompt',
        includeRawChunks: true,
      }).consumeStream();

      expect(capturedOptions.includeRawChunks).toBe(true);

      await streamText({
        model,
        prompt: 'test prompt',
        includeRawChunks: false,
      }).consumeStream();

      expect(capturedOptions.includeRawChunks).toBe(false);

      await streamText({
        model,
        prompt: 'test prompt',
      }).consumeStream();

      expect(capturedOptions.includeRawChunks).toBe(false);
    });
  });

  describe('mixed multi content streaming with interleaving parts', () => {
    describe('mixed text and reasoning blocks', () => {
      let result: StreamTextResult<any, any>;

      beforeEach(async () => {
        result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              { type: 'reasoning-start', id: '0' },
              { type: 'text-start', id: '1' },
              { type: 'reasoning-delta', id: '0', delta: 'Thinking...' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-delta', id: '1', delta: ', ' },
              { type: 'text-start', id: '2' },
              { type: 'text-delta', id: '2', delta: `This ` },
              { type: 'text-delta', id: '2', delta: `is ` },
              { type: 'reasoning-start', id: '3' },
              { type: 'reasoning-delta', id: '0', delta: `I'm thinking...` },
              { type: 'reasoning-delta', id: '3', delta: `Separate thoughts` },
              { type: 'text-delta', id: '2', delta: `a` },
              { type: 'text-delta', id: '1', delta: `world!` },
              { type: 'reasoning-end', id: '0' },
              { type: 'text-delta', id: '2', delta: ` test.` },
              { type: 'text-end', id: '2' },
              { type: 'reasoning-end', id: '3' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          }),
          prompt: 'test-input',
          _internal: {
            currentDate: mockValues(new Date(2000)),
            generateId: mockId(),
          },
        });
      });

      it('should return the full stream with the correct parts', async () => {
        expect(await convertAsyncIterableToArray(result.fullStream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "0",
                "type": "reasoning-start",
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "id": "0",
                "providerMetadata": undefined,
                "text": "Thinking...",
                "type": "reasoning-delta",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "Hello",
                "type": "text-delta",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": ", ",
                "type": "text-delta",
              },
              {
                "id": "2",
                "type": "text-start",
              },
              {
                "id": "2",
                "providerMetadata": undefined,
                "text": "This ",
                "type": "text-delta",
              },
              {
                "id": "2",
                "providerMetadata": undefined,
                "text": "is ",
                "type": "text-delta",
              },
              {
                "id": "3",
                "type": "reasoning-start",
              },
              {
                "id": "0",
                "providerMetadata": undefined,
                "text": "I'm thinking...",
                "type": "reasoning-delta",
              },
              {
                "id": "3",
                "providerMetadata": undefined,
                "text": "Separate thoughts",
                "type": "reasoning-delta",
              },
              {
                "id": "2",
                "providerMetadata": undefined,
                "text": "a",
                "type": "text-delta",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "world!",
                "type": "text-delta",
              },
              {
                "id": "0",
                "type": "reasoning-end",
              },
              {
                "id": "2",
                "providerMetadata": undefined,
                "text": " test.",
                "type": "text-delta",
              },
              {
                "id": "2",
                "type": "text-end",
              },
              {
                "id": "3",
                "type": "reasoning-end",
              },
              {
                "id": "1",
                "type": "text-end",
              },
              {
                "finishReason": "stop",
                "providerMetadata": undefined,
                "response": {
                  "headers": undefined,
                  "id": "id-0",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:02.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
              },
              {
                "finishReason": "stop",
                "totalUsage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "type": "finish",
              },
            ]
          `);
      });

      it('should return the content parts in the correct order', async () => {
        await result.consumeStream();

        expect(await result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": undefined,
              "text": "Thinking...I'm thinking...",
              "type": "reasoning",
            },
            {
              "providerMetadata": undefined,
              "text": "Hello, world!",
              "type": "text",
            },
            {
              "providerMetadata": undefined,
              "text": "This is a test.",
              "type": "text",
            },
            {
              "providerMetadata": undefined,
              "text": "Separate thoughts",
              "type": "reasoning",
            },
          ]
        `);
      });

      it('should return the step content parts in the correct order', async () => {
        await result.consumeStream();

        expect(await result.steps).toMatchInlineSnapshot(`
          [
            DefaultStepResult {
              "content": [
                {
                  "providerMetadata": undefined,
                  "text": "Thinking...I'm thinking...",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "text": "Hello, world!",
                  "type": "text",
                },
                {
                  "providerMetadata": undefined,
                  "text": "This is a test.",
                  "type": "text",
                },
                {
                  "providerMetadata": undefined,
                  "text": "Separate thoughts",
                  "type": "reasoning",
                },
              ],
              "finishReason": "stop",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "headers": undefined,
                "id": "id-0",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "Thinking...I'm thinking...",
                        "type": "reasoning",
                      },
                      {
                        "providerOptions": undefined,
                        "text": "Hello, world!",
                        "type": "text",
                      },
                      {
                        "providerOptions": undefined,
                        "text": "This is a test.",
                        "type": "text",
                      },
                      {
                        "providerOptions": undefined,
                        "text": "Separate thoughts",
                        "type": "reasoning",
                      },
                    ],
                    "role": "assistant",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:02.000Z,
              },
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "warnings": [],
            },
          ]
        `);
      });
    });
  });

  describe('abort signal', () => {
    describe('basic abort', () => {
      let result: StreamTextResult<ToolSet, TextStreamPart<ToolSet>>;
      let onErrorCalls: Array<{ error: unknown }> = [];
      let onAbortCalls: Array<{ steps: StepResult<ToolSet>[] }> = [];

      beforeEach(() => {
        onErrorCalls = [];
        onAbortCalls = [];

        const abortController = new AbortController();
        let pullCalls = 0;

        result = streamText({
          abortSignal: abortController.signal,
          onError: error => {
            onErrorCalls.push({ error });
          },
          onAbort: event => {
            onAbortCalls.push(event);
          },
          model: new MockLanguageModelV2({
            doStream: async () => ({
              stream: new ReadableStream({
                pull(controller) {
                  switch (pullCalls++) {
                    case 0:
                      controller.enqueue({
                        type: 'stream-start',
                        warnings: [],
                      });
                      break;
                    case 1:
                      controller.enqueue({
                        type: 'text-start',
                        id: '1',
                      });
                      break;
                    case 2:
                      controller.enqueue({
                        type: 'text-delta',
                        id: '1',
                        delta: 'Hello',
                      });
                      break;
                    case 3:
                      abortController.abort();
                      controller.error(
                        new DOMException(
                          'The user aborted a request.',
                          'AbortError',
                        ),
                      );
                      break;
                  }
                },
              }),
            }),
          }),
          prompt: 'test-input',
        });
      });

      it('should not call onError for abort errors', async () => {
        await result.consumeStream();
        expect(onErrorCalls).toMatchInlineSnapshot(`[]`);
      });

      it('should call onAbort when the abort signal is triggered', async () => {
        await result.consumeStream();
        expect(onAbortCalls).toMatchInlineSnapshot(`
          [
            {
              "steps": [],
            },
          ]
        `);
      });

      it('should only stream initial chunks in full stream', async () => {
        expect(await convertAsyncIterableToArray(result.fullStream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "Hello",
                "type": "text-delta",
              },
              {
                "type": "abort",
              },
            ]
          `);
      });

      it('should sent an abort chunk in the ui message stream', async () => {
        expect(await convertAsyncIterableToArray(result.toUIMessageStream()))
          .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello",
              "id": "1",
              "type": "text-delta",
            },
            {
              "type": "abort",
            },
          ]
        `);
      });
    });

    describe('abort in 2nd step', () => {
      let result: StreamTextResult<any, TextStreamPart<any>>;
      let onErrorCalls: Array<{ error: unknown }> = [];
      let onAbortCalls: Array<{ steps: StepResult<any>[] }> = [];

      beforeEach(() => {
        onErrorCalls = [];
        onAbortCalls = [];

        const abortController = new AbortController();
        let pullCalls = 0;
        let streamCalls = 0;

        result = streamText({
          abortSignal: abortController.signal,
          onAbort: event => {
            onAbortCalls.push(event);
          },
          model: new MockLanguageModelV2({
            doStream: async () => ({
              stream: new ReadableStream({
                start(controller) {
                  streamCalls++;
                  pullCalls = 0;
                },
                pull(controller) {
                  if (streamCalls === 1) {
                    switch (pullCalls++) {
                      case 0:
                        controller.enqueue({
                          type: 'stream-start',
                          warnings: [],
                        });
                        break;
                      case 1:
                        controller.enqueue({
                          type: 'tool-call',
                          toolCallId: 'call-1',
                          toolName: 'tool1',
                          input: `{ "value": "value" }`,
                        });
                        break;
                      case 2:
                        controller.enqueue({
                          type: 'finish',
                          finishReason: 'tool-calls',
                          usage: testUsage,
                        });
                        controller.close();
                        break;
                    }
                  } else
                    switch (pullCalls++) {
                      case 0:
                        controller.enqueue({
                          type: 'stream-start',
                          warnings: [],
                        });
                        break;
                      case 1:
                        controller.enqueue({
                          type: 'text-start',
                          id: '1',
                        });
                        break;
                      case 2:
                        controller.enqueue({
                          type: 'text-delta',
                          id: '1',
                          delta: 'Hello',
                        });
                        break;
                      case 3:
                        abortController.abort();
                        controller.error(
                          new DOMException(
                            'The user aborted a request.',
                            'AbortError',
                          ),
                        );
                        break;
                    }
                },
              }),
            }),
          }),
          tools: {
            tool1: {
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          stopWhen: stepCountIs(3),
          ...defaultSettings(),
          onError: error => {
            onErrorCalls.push({ error });
          },
        });
      });

      it('should not call onError for abort errors', async () => {
        await result.consumeStream();
        expect(onErrorCalls).toMatchInlineSnapshot(`[]`);
      });

      it('should call onAbort when the abort signal is triggered', async () => {
        await result.consumeStream();
        expect(onAbortCalls).toMatchInlineSnapshot(`
          [
            {
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": undefined,
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
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
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
              ],
            },
          ]
        `);
      });

      it('should only stream initial chunks in full stream', async () => {
        expect(await convertAsyncIterableToArray(result.fullStream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
              {
                "input": {
                  "value": "value",
                },
                "output": "result1",
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
              {
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "response": {
                  "headers": undefined,
                  "id": "id-0",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "Hello",
                "type": "text-delta",
              },
              {
                "type": "abort",
              },
            ]
          `);
      });

      it('should sent an abort chunk in the ui message stream', async () => {
        expect(await convertAsyncIterableToArray(result.toUIMessageStream()))
          .toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "input": {
                "value": "value",
              },
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-input-available",
            },
            {
              "output": "result1",
              "toolCallId": "call-1",
              "type": "tool-output-available",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "start-step",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello",
              "id": "1",
              "type": "text-delta",
            },
            {
              "type": "abort",
            },
          ]
        `);
      });
    });
  });

  describe('tool execution context', () => {
    it('should send context to tool execution', async () => {
      let recordedContext: unknown | undefined;

      const result = streamText({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-input-start',
              id: 'call-1',
              toolName: 'web_search',
              providerExecuted: true,
            },
            {
              type: 'tool-input-delta',
              id: 'call-1',
              delta: '{ "value": "value" }',
            },
            {
              type: 'tool-input-end',
              id: 'call-1',
            },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 't1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          t1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }, { experimental_context }) => {
              recordedContext = experimental_context;
              return { value: 'test-result' };
            },
          }),
        },
        experimental_context: {
          context: 'test',
        },
        prompt: 'test-input',
      });

      await result.consumeStream();

      // tool should be executed by client
      expect(recordedContext).toStrictEqual({
        context: 'test',
      });
    });
  });

  describe('invalid tool calls', () => {
    describe('single invalid tool call', () => {
      let result: StreamTextResult<any, any>;

      beforeEach(async () => {
        result = streamText({
          model: createTestModel({
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-input-start',
                id: 'call-1',
                toolName: 'cityAttractions',
              },
              {
                type: 'tool-input-delta',
                id: 'call-1',
                delta: `{ "cities": "San Francisco" }`,
              },
              {
                type: 'tool-input-end',
                id: 'call-1',
              },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'cityAttractions',
                // wrong tool call arguments (city vs cities):
                input: `{ "cities": "San Francisco" }`,
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          }),
          prompt: 'test-input',
          _internal: {
            currentDate: mockValues(new Date(2000)),
            generateId: mockId(),
          },
          tools: {
            cityAttractions: tool({
              inputSchema: z.object({ city: z.string() }),
            }),
          },
        });
      });

      it('should add tool call and result error parts to the content', async () => {
        await result.consumeStream();
        expect(await result.content).toMatchInlineSnapshot(`
          [
            {
              "dynamic": true,
              "error": [AI_InvalidToolInputError: Invalid input for tool cityAttractions: Type validation failed: Value: {"cities":"San Francisco"}.
          Error message: [
            {
              "expected": "string",
              "code": "invalid_type",
              "path": [
                "city"
              ],
              "message": "Invalid input: expected string, received undefined"
            }
          ]],
              "input": "{ "cities": "San Francisco" }",
              "invalid": true,
              "toolCallId": "call-1",
              "toolName": "cityAttractions",
              "type": "tool-call",
            },
            {
              "dynamic": true,
              "error": "Invalid input for tool cityAttractions: Type validation failed: Value: {"cities":"San Francisco"}.
          Error message: [
            {
              "expected": "string",
              "code": "invalid_type",
              "path": [
                "city"
              ],
              "message": "Invalid input: expected string, received undefined"
            }
          ]",
              "input": "{ "cities": "San Francisco" }",
              "toolCallId": "call-1",
              "toolName": "cityAttractions",
              "type": "tool-error",
            },
          ]
        `);
      });

      it('should add tool call and result error parts to the full stream', async () => {
        expect(await convertAsyncIterableToArray(result.fullStream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "dynamic": false,
                "id": "call-1",
                "toolName": "cityAttractions",
                "type": "tool-input-start",
              },
              {
                "delta": "{ "cities": "San Francisco" }",
                "id": "call-1",
                "type": "tool-input-delta",
              },
              {
                "id": "call-1",
                "type": "tool-input-end",
              },
              {
                "dynamic": true,
                "error": [AI_InvalidToolInputError: Invalid input for tool cityAttractions: Type validation failed: Value: {"cities":"San Francisco"}.
            Error message: [
              {
                "expected": "string",
                "code": "invalid_type",
                "path": [
                  "city"
                ],
                "message": "Invalid input: expected string, received undefined"
              }
            ]],
                "input": "{ "cities": "San Francisco" }",
                "invalid": true,
                "toolCallId": "call-1",
                "toolName": "cityAttractions",
                "type": "tool-call",
              },
              {
                "dynamic": true,
                "error": "Invalid input for tool cityAttractions: Type validation failed: Value: {"cities":"San Francisco"}.
            Error message: [
              {
                "expected": "string",
                "code": "invalid_type",
                "path": [
                  "city"
                ],
                "message": "Invalid input: expected string, received undefined"
              }
            ]",
                "input": "{ "cities": "San Francisco" }",
                "toolCallId": "call-1",
                "toolName": "cityAttractions",
                "type": "tool-error",
              },
              {
                "finishReason": "stop",
                "providerMetadata": undefined,
                "response": {
                  "headers": undefined,
                  "id": "id-0",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:02.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
              },
              {
                "finishReason": "stop",
                "totalUsage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "type": "finish",
              },
            ]
          `);
      });

      it('should add tool call and result error parts to the ui message stream', async () => {
        expect(await convertAsyncIterableToArray(result.toUIMessageStream()))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "type": "start-step",
              },
              {
                "toolCallId": "call-1",
                "toolName": "cityAttractions",
                "type": "tool-input-start",
              },
              {
                "inputTextDelta": "{ "cities": "San Francisco" }",
                "toolCallId": "call-1",
                "type": "tool-input-delta",
              },
              {
                "errorText": "Invalid input for tool cityAttractions: Type validation failed: Value: {"cities":"San Francisco"}.
            Error message: [
              {
                "expected": "string",
                "code": "invalid_type",
                "path": [
                  "city"
                ],
                "message": "Invalid input: expected string, received undefined"
              }
            ]",
                "input": "{ "cities": "San Francisco" }",
                "toolCallId": "call-1",
                "toolName": "cityAttractions",
                "type": "tool-input-error",
              },
              {
                "errorText": "Invalid input for tool cityAttractions: Type validation failed: Value: {"cities":"San Francisco"}.
            Error message: [
              {
                "expected": "string",
                "code": "invalid_type",
                "path": [
                  "city"
                ],
                "message": "Invalid input: expected string, received undefined"
              }
            ]",
                "toolCallId": "call-1",
                "type": "tool-output-error",
              },
              {
                "type": "finish-step",
              },
              {
                "type": "finish",
              },
            ]
          `);
      });
    });
  });
});
