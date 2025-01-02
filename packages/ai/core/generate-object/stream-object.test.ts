import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { jsonSchema } from '@ai-sdk/ui-utils';
import assert, { fail } from 'node:assert';
import { z } from 'zod';
import {
  NoObjectGeneratedError,
  verifyNoObjectGeneratedError,
} from '../../errors/no-object-generated-error';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { createMockServerResponse } from '../test/mock-server-response';
import { MockTracer } from '../test/mock-tracer';
import { AsyncIterableStream } from '../util/async-iterable-stream';
import { streamObject } from './stream-object';
import { StreamObjectResult } from './stream-object-result';

describe('streamObject', () => {
  describe('output = "object"', () => {
    describe('result.objectStream', () => {
      it('should send object deltas with json mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              expect(mode).toStrictEqual({
                type: 'object-json',
                name: undefined,
                description: undefined,
                schema: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { content: { type: 'string' } },
                  required: ['content'],
                  type: 'object',
                },
              });

              expect(prompt).toStrictEqual([
                {
                  role: 'system',
                  content:
                    'JSON schema:\n' +
                    '{"type":"object","properties":{"content":{"type":"string"}},"required":["content"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}\n' +
                    'You MUST answer with a JSON object that matches the JSON schema above.',
                },
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'prompt' }],
                  providerMetadata: undefined,
                },
              ]);

              return {
                stream: convertArrayToReadableStream([
                  { type: 'text-delta', textDelta: '{ ' },
                  { type: 'text-delta', textDelta: '"content": ' },
                  { type: 'text-delta', textDelta: `"Hello, ` },
                  { type: 'text-delta', textDelta: `world` },
                  { type: 'text-delta', textDelta: `!"` },
                  { type: 'text-delta', textDelta: ' }' },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.partialObjectStream),
          [
            {},
            { content: 'Hello, ' },
            { content: 'Hello, world' },
            { content: 'Hello, world!' },
          ],
        );
      });

      it('should send object deltas with json mode when structured outputs are enabled', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            supportsStructuredOutputs: true,
            doStream: async ({ prompt, mode }) => {
              assert.deepStrictEqual(mode, {
                type: 'object-json',
                name: undefined,
                description: undefined,
                schema: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { content: { type: 'string' } },
                  required: ['content'],
                  type: 'object',
                },
              });

              expect(prompt).toStrictEqual([
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'prompt' }],
                  providerMetadata: undefined,
                },
              ]);
              return {
                stream: convertArrayToReadableStream([
                  { type: 'text-delta', textDelta: '{ ' },
                  { type: 'text-delta', textDelta: '"content": ' },
                  { type: 'text-delta', textDelta: `"Hello, ` },
                  { type: 'text-delta', textDelta: `world` },
                  { type: 'text-delta', textDelta: `!"` },
                  { type: 'text-delta', textDelta: ' }' },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.partialObjectStream),
          [
            {},
            { content: 'Hello, ' },
            { content: 'Hello, world' },
            { content: 'Hello, world!' },
          ],
        );
      });

      it('should use name and description with json mode when structured outputs are enabled', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            supportsStructuredOutputs: true,
            doStream: async ({ prompt, mode }) => {
              assert.deepStrictEqual(mode, {
                type: 'object-json',
                name: 'test-name',
                description: 'test description',
                schema: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { content: { type: 'string' } },
                  required: ['content'],
                  type: 'object',
                },
              });

              expect(prompt).toStrictEqual([
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'prompt' }],
                  providerMetadata: undefined,
                },
              ]);

              return {
                stream: convertArrayToReadableStream([
                  { type: 'text-delta', textDelta: '{ ' },
                  { type: 'text-delta', textDelta: '"content": ' },
                  { type: 'text-delta', textDelta: `"Hello, ` },
                  { type: 'text-delta', textDelta: `world` },
                  { type: 'text-delta', textDelta: `!"` },
                  { type: 'text-delta', textDelta: ' }' },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          schemaName: 'test-name',
          schemaDescription: 'test description',
          mode: 'json',
          prompt: 'prompt',
        });

        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.partialObjectStream),
          [
            {},
            { content: 'Hello, ' },
            { content: 'Hello, world' },
            { content: 'Hello, world!' },
          ],
        );
      });

      it('should send object deltas with tool mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              assert.deepStrictEqual(mode, {
                type: 'object-tool',
                tool: {
                  type: 'function',
                  name: 'json',
                  description: 'Respond with a JSON object.',
                  parameters: {
                    $schema: 'http://json-schema.org/draft-07/schema#',
                    additionalProperties: false,
                    properties: { content: { type: 'string' } },
                    required: ['content'],
                    type: 'object',
                  },
                },
              });
              expect(prompt).toStrictEqual([
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'prompt' }],
                  providerMetadata: undefined,
                },
              ]);

              return {
                stream: convertArrayToReadableStream([
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: '{ ',
                  },
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: '"content": ',
                  },
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: `"Hello, `,
                  },
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: `world`,
                  },
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: `!"`,
                  },
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: ' }',
                  },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          mode: 'tool',
          prompt: 'prompt',
        });

        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.partialObjectStream),
          [
            {},
            { content: 'Hello, ' },
            { content: 'Hello, world' },
            { content: 'Hello, world!' },
          ],
        );
      });

      it('should  use name and description with tool mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              assert.deepStrictEqual(mode, {
                type: 'object-tool',
                tool: {
                  type: 'function',
                  name: 'test-name',
                  description: 'test description',
                  parameters: {
                    $schema: 'http://json-schema.org/draft-07/schema#',
                    additionalProperties: false,
                    properties: { content: { type: 'string' } },
                    required: ['content'],
                    type: 'object',
                  },
                },
              });
              expect(prompt).toStrictEqual([
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'prompt' }],
                  providerMetadata: undefined,
                },
              ]);

              return {
                stream: convertArrayToReadableStream([
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: '{ ',
                  },
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: '"content": ',
                  },
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: `"Hello, `,
                  },
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: `world`,
                  },
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: `!"`,
                  },
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: ' }',
                  },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          schemaName: 'test-name',
          schemaDescription: 'test description',
          mode: 'tool',
          prompt: 'prompt',
        });

        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.partialObjectStream),
          [
            {},
            { content: 'Hello, ' },
            { content: 'Hello, world' },
            { content: 'Hello, world!' },
          ],
        );
      });

      it('should handle error in doStream', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => {
              throw new Error('test error');
            },
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        await expect(async () => {
          await convertAsyncIterableToArray(result.partialObjectStream);
        }).rejects.toThrow('test error');
      });
    });

    describe('result.fullStream', () => {
      it('should send full stream data', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-delta', textDelta: '{ ' },
                { type: 'text-delta', textDelta: '"content": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 2 },
                  logprobs: [{ token: '-', logprob: 1, topLogprobs: [] }],
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: { logprobs: 0 } },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        expect(
          await convertAsyncIterableToArray(result.fullStream),
        ).toMatchSnapshot();
      });
    });

    describe('result.textStream', () => {
      it('should send text stream', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: '{ ' },
                { type: 'text-delta', textDelta: '"content": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 2 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.textStream),
          ['{ ', '"content": "Hello, ', 'world', '!"', ' }'],
        );
      });
    });

    describe('result.toTextStreamResponse', () => {
      it('should create a Response with a text stream', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: '{ ' },
                { type: 'text-delta', textDelta: '"content": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 2 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        const response = result.toTextStreamResponse();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(
          response.headers.get('Content-Type'),
          'text/plain; charset=utf-8',
        );

        assert.deepStrictEqual(
          await convertReadableStreamToArray(
            response.body!.pipeThrough(new TextDecoderStream()),
          ),
          ['{ ', '"content": "Hello, ', 'world', '!"', ' }'],
        );
      });
    });

    describe('result.pipeTextStreamToResponse', async () => {
      it('should write text deltas to a Node.js response-like object', async () => {
        const mockResponse = createMockServerResponse();

        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: '{ ' },
                { type: 'text-delta', textDelta: '"content": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 2 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        result.pipeTextStreamToResponse(mockResponse);

        await mockResponse.waitForEnd();

        expect(mockResponse.statusCode).toBe(200);
        expect(mockResponse.headers).toEqual({
          'Content-Type': 'text/plain; charset=utf-8',
        });
        expect(mockResponse.getDecodedChunks()).toEqual([
          '{ ',
          '"content": "Hello, ',
          'world',
          '!"',
          ' }',
        ]);
      });
    });

    describe('result.usage', () => {
      it('should resolve with token usage', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'text-delta',
                  textDelta: '{ "content": "Hello, world!" }',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        // consume stream (runs in parallel)
        convertAsyncIterableToArray(result.partialObjectStream);

        assert.deepStrictEqual(await result.usage, {
          completionTokens: 10,
          promptTokens: 3,
          totalTokens: 13,
        });
      });
    });

    describe('result.providerMetadata', () => {
      it('should resolve with provider metadata', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'text-delta',
                  textDelta: '{ "content": "Hello, world!" }',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                  providerMetadata: {
                    testProvider: { testKey: 'testValue' },
                  },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        // consume stream (runs in parallel)
        convertAsyncIterableToArray(result.partialObjectStream);

        assert.deepStrictEqual(await result.experimental_providerMetadata, {
          testProvider: { testKey: 'testValue' },
        });
      });
    });

    describe('result.response', () => {
      it('should resolve with response information in json mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'text-delta',
                  textDelta: '{"content": "Hello, world!"}',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              rawResponse: { headers: { call: '2' } },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        // consume stream (runs in parallel)
        convertAsyncIterableToArray(result.partialObjectStream);

        expect(await result.response).toStrictEqual({
          id: 'id-0',
          modelId: 'mock-model-id',
          timestamp: new Date(0),
          headers: { call: '2' },
        });
      });

      it('should resolve with response information in tool mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: 'tool-call-1',
                  toolName: 'json',
                  argsTextDelta: '{"content": "Hello, world!"}',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              rawResponse: { headers: { call: '2' } },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'tool',
          prompt: 'prompt',
        });

        // consume stream (runs in parallel)
        convertAsyncIterableToArray(result.partialObjectStream);

        expect(await result.response).toStrictEqual({
          id: 'id-0',
          modelId: 'mock-model-id',
          timestamp: new Date(0),
          headers: { call: '2' },
        });
      });
    });

    describe('result.request', () => {
      it('should contain request information with json mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'text-delta',
                  textDelta: '{"content": "Hello, world!"}',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              request: { body: 'test body' },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        // consume stream (runs in parallel)
        await convertAsyncIterableToArray(result.partialObjectStream);

        expect(await result.request).toStrictEqual({
          body: 'test body',
        });
      });

      it('should contain request information with tool mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: 'tool-call-1',
                  toolName: 'json',
                  argsTextDelta: '{"content": "Hello, world!"}',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  logprobs: undefined,
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              request: { body: 'test body' },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'tool',
          prompt: 'prompt',
        });

        // consume stream (runs in parallel)
        await convertAsyncIterableToArray(result.partialObjectStream);

        expect(await result.request).toStrictEqual({
          body: 'test body',
        });
      });
    });

    describe('result.object', () => {
      it('should resolve with typed object', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: '{ ' },
                { type: 'text-delta', textDelta: '"content": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        // consume stream (runs in parallel)
        convertAsyncIterableToArray(result.partialObjectStream);

        assert.deepStrictEqual(await result.object, {
          content: 'Hello, world!',
        });
      });

      it('should reject object promise when the streamed object does not match the schema', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: '{ ' },
                { type: 'text-delta', textDelta: '"invalid": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        // consume stream (runs in parallel)
        convertAsyncIterableToArray(result.partialObjectStream);

        expect(result.object).rejects.toThrow(NoObjectGeneratedError);
      });

      it('should not lead to unhandled promise rejections when the streamed object does not match the schema', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: '{ ' },
                { type: 'text-delta', textDelta: '"invalid": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        // consume stream (runs in parallel)
        convertAsyncIterableToArray(result.partialObjectStream);

        // unhandled promise rejection should not be thrown (Vitest does this automatically)
      });
    });

    describe('options.onFinish', () => {
      it('should be called when a valid object is generated', async () => {
        let result: Parameters<
          Required<Parameters<typeof streamObject>[0]>['onFinish']
        >[0];

        const { partialObjectStream } = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'text-delta',
                  textDelta: '{ "content": "Hello, world!" }',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                  providerMetadata: {
                    testProvider: { testKey: 'testValue' },
                  },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
          onFinish: async event => {
            result = event as unknown as typeof result;
          },
        });

        // consume stream
        await convertAsyncIterableToArray(partialObjectStream);

        expect(result!).toMatchSnapshot();
      });

      it("should be called when object doesn't match the schema", async () => {
        let result: Parameters<
          Required<Parameters<typeof streamObject>[0]>['onFinish']
        >[0];

        const { partialObjectStream, object } = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-delta', textDelta: '{ ' },
                { type: 'text-delta', textDelta: '"invalid": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
          onFinish: async event => {
            result = event as unknown as typeof result;
          },
        });

        // consume stream
        await convertAsyncIterableToArray(partialObjectStream);

        // consume expected error rejection
        await object.catch(() => {});

        expect(result!).toMatchSnapshot();
      });
    });

    describe('options.headers', () => {
      it('should pass headers to model in json mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async ({ headers }) => {
              expect(headers).toStrictEqual({
                'custom-request-header': 'request-header-value',
              });

              return {
                stream: convertArrayToReadableStream([
                  {
                    type: 'text-delta',
                    textDelta: `{ "content": "headers test" }`,
                  },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
          headers: { 'custom-request-header': 'request-header-value' },
        });

        expect(
          await convertAsyncIterableToArray(result.partialObjectStream),
        ).toStrictEqual([{ content: 'headers test' }]);
      });

      it('should pass headers to model in tool mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async ({ headers }) => {
              expect(headers).toStrictEqual({
                'custom-request-header': 'request-header-value',
              });

              return {
                stream: convertArrayToReadableStream([
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: `{ "content": "headers test" }`,
                  },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          mode: 'tool',
          prompt: 'prompt',
          headers: { 'custom-request-header': 'request-header-value' },
        });

        expect(
          await convertAsyncIterableToArray(result.partialObjectStream),
        ).toStrictEqual([{ content: 'headers test' }]);
      });
    });

    describe('options.providerMetadata', () => {
      it('should pass provider metadata to model in json mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async ({ providerMetadata }) => {
              expect(providerMetadata).toStrictEqual({
                aProvider: { someKey: 'someValue' },
              });

              return {
                stream: convertArrayToReadableStream([
                  {
                    type: 'text-delta',
                    textDelta: `{ "content": "provider metadata test" }`,
                  },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
          experimental_providerMetadata: {
            aProvider: { someKey: 'someValue' },
          },
        });

        expect(
          await convertAsyncIterableToArray(result.partialObjectStream),
        ).toStrictEqual([{ content: 'provider metadata test' }]);
      });

      it('should pass provider metadata to model in tool mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async ({ providerMetadata }) => {
              expect(providerMetadata).toStrictEqual({
                aProvider: { someKey: 'someValue' },
              });

              return {
                stream: convertArrayToReadableStream([
                  {
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: 'tool-call-1',
                    toolName: 'json',
                    argsTextDelta: `{ "content": "provider metadata test" }`,
                  },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          mode: 'tool',
          prompt: 'prompt',
          experimental_providerMetadata: {
            aProvider: { someKey: 'someValue' },
          },
        });

        expect(
          await convertAsyncIterableToArray(result.partialObjectStream),
        ).toStrictEqual([{ content: 'provider metadata test' }]);
      });
    });

    describe('custom schema', () => {
      it('should send object deltas with json mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              assert.deepStrictEqual(mode, {
                type: 'object-json',
                name: undefined,
                description: undefined,
                schema: jsonSchema({
                  type: 'object',
                  properties: { content: { type: 'string' } },
                  required: ['content'],
                  additionalProperties: false,
                }).jsonSchema,
              });

              expect(prompt).toStrictEqual([
                {
                  role: 'system',
                  content:
                    'JSON schema:\n' +
                    '{"type":"object","properties":{"content":{"type":"string"}},"required":["content"],"additionalProperties":false}\n' +
                    'You MUST answer with a JSON object that matches the JSON schema above.',
                },
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'prompt' }],
                  providerMetadata: undefined,
                },
              ]);

              return {
                stream: convertArrayToReadableStream([
                  { type: 'text-delta', textDelta: '{ ' },
                  { type: 'text-delta', textDelta: '"content": ' },
                  { type: 'text-delta', textDelta: `"Hello, ` },
                  { type: 'text-delta', textDelta: `world` },
                  { type: 'text-delta', textDelta: `!"` },
                  { type: 'text-delta', textDelta: ' }' },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: jsonSchema({
            type: 'object',
            properties: { content: { type: 'string' } },
            required: ['content'],
            additionalProperties: false,
          }),
          mode: 'json',
          prompt: 'prompt',
        });

        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.partialObjectStream),
          [
            {},
            { content: 'Hello, ' },
            { content: 'Hello, world' },
            { content: 'Hello, world!' },
          ],
        );
      });
    });

    describe('error handling', () => {
      it('should throw NoObjectGeneratedError when schema validation fails in tool mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: 'tool-call-1',
                  toolName: 'json',
                  argsTextDelta: '{ "content": 123 }',
                },
                {
                  type: 'response-metadata',
                  id: 'id-1',
                  timestamp: new Date(123),
                  modelId: 'model-1',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'tool',
          prompt: 'prompt',
        });

        try {
          await convertAsyncIterableToArray(result.partialObjectStream);
          await result.object;
          fail('must throw error');
        } catch (error) {
          verifyNoObjectGeneratedError(error, {
            message: 'No object generated: response did not match schema.',
            response: {
              id: 'id-1',
              timestamp: new Date(123),
              modelId: 'model-1',
            },
            usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
          });
        }
      });

      it('should throw NoObjectGeneratedError when schema validation fails in json mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: '{ "content": 123 }' },
                {
                  type: 'response-metadata',
                  id: 'id-1',
                  timestamp: new Date(123),
                  modelId: 'model-1',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        try {
          await convertAsyncIterableToArray(result.partialObjectStream);
          await result.object;
          fail('must throw error');
        } catch (error) {
          verifyNoObjectGeneratedError(error, {
            message: 'No object generated: response did not match schema.',
            response: {
              id: 'id-1',
              timestamp: new Date(123),
              modelId: 'model-1',
            },
            usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
          });
        }
      });

      it('should throw NoObjectGeneratedError when parsing fails in tool mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: 'tool-call-1',
                  toolName: 'json',
                  argsTextDelta: '{ broken json',
                },
                {
                  type: 'response-metadata',
                  id: 'id-1',
                  timestamp: new Date(123),
                  modelId: 'model-1',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'tool',
          prompt: 'prompt',
        });

        try {
          await convertAsyncIterableToArray(result.partialObjectStream);
          await result.object;
          fail('must throw error');
        } catch (error) {
          verifyNoObjectGeneratedError(error, {
            message: 'No object generated: response did not match schema.',
            response: {
              id: 'id-1',
              timestamp: new Date(123),
              modelId: 'model-1',
            },
            usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
          });
        }
      });

      it('should throw NoObjectGeneratedError when parsing fails in json mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: '{ broken json' },
                {
                  type: 'response-metadata',
                  id: 'id-1',
                  timestamp: new Date(123),
                  modelId: 'model-1',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        try {
          await convertAsyncIterableToArray(result.partialObjectStream);
          await result.object;
          fail('must throw error');
        } catch (error) {
          verifyNoObjectGeneratedError(error, {
            message: 'No object generated: response did not match schema.',
            response: {
              id: 'id-1',
              timestamp: new Date(123),
              modelId: 'model-1',
            },
            usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
          });
        }
      });

      it('should throw NoObjectGeneratedError when no tool call is made in tool mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-1',
                  timestamp: new Date(123),
                  modelId: 'model-1',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'tool',
          prompt: 'prompt',
        });

        try {
          await convertAsyncIterableToArray(result.partialObjectStream);
          await result.object;
          fail('must throw error');
        } catch (error) {
          verifyNoObjectGeneratedError(error, {
            message: 'No object generated: response did not match schema.',
            response: {
              id: 'id-1',
              timestamp: new Date(123),
              modelId: 'model-1',
            },
            usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
          });
        }
      });

      it('should throw NoObjectGeneratedError when no text is generated in json mode', async () => {
        const result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-1',
                  timestamp: new Date(123),
                  modelId: 'model-1',
                },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          }),
          schema: z.object({ content: z.string() }),
          mode: 'json',
          prompt: 'prompt',
        });

        try {
          await convertAsyncIterableToArray(result.partialObjectStream);
          await result.object;
          fail('must throw error');
        } catch (error) {
          verifyNoObjectGeneratedError(error, {
            message: 'No object generated: response did not match schema.',
            response: {
              id: 'id-1',
              timestamp: new Date(123),
              modelId: 'model-1',
            },
            usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
          });
        }
      });
    });
  });

  describe('output = "array"', () => {
    describe('array with 3 elements', () => {
      let result: StreamObjectResult<
        { content: string }[],
        { content: string }[],
        AsyncIterableStream<{ content: string }>
      >;

      let onFinishResult: Parameters<
        Required<Parameters<typeof streamObject>[0]>['onFinish']
      >[0];

      beforeEach(async () => {
        result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              assert.deepStrictEqual(mode, {
                type: 'object-json',
                name: undefined,
                description: undefined,
                schema: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: {
                    elements: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { content: { type: 'string' } },
                        required: ['content'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['elements'],
                  type: 'object',
                },
              });

              expect(prompt).toStrictEqual([
                {
                  role: 'system',
                  content:
                    'JSON schema:\n' +
                    `{\"$schema\":\"http://json-schema.org/draft-07/schema#\",\"type\":\"object\",\"properties\":{\"elements\":{\"type\":\"array\",\"items\":{\"type\":\"object\",\"properties\":{\"content\":{\"type\":\"string\"}},\"required\":[\"content\"],\"additionalProperties\":false}}},\"required\":[\"elements\"],\"additionalProperties\":false}` +
                    `\n` +
                    'You MUST answer with a JSON object that matches the JSON schema above.',
                },
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'prompt' }],
                  providerMetadata: undefined,
                },
              ]);

              return {
                stream: convertArrayToReadableStream([
                  { type: 'text-delta', textDelta: '{"elements":[' },
                  // first element:
                  { type: 'text-delta', textDelta: '{' },
                  { type: 'text-delta', textDelta: '"content":' },
                  { type: 'text-delta', textDelta: `"element 1"` },
                  { type: 'text-delta', textDelta: '},' },
                  // second element:
                  { type: 'text-delta', textDelta: '{ ' },
                  { type: 'text-delta', textDelta: '"content": ' },
                  { type: 'text-delta', textDelta: `"element 2"` },
                  { type: 'text-delta', textDelta: '},' },
                  // third element:
                  { type: 'text-delta', textDelta: '{' },
                  { type: 'text-delta', textDelta: '"content":' },
                  { type: 'text-delta', textDelta: `"element 3"` },
                  { type: 'text-delta', textDelta: '}' },
                  // end of array
                  { type: 'text-delta', textDelta: ']' },
                  { type: 'text-delta', textDelta: '}' },
                  // finish
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          output: 'array',
          mode: 'json',
          prompt: 'prompt',
          onFinish: async event => {
            onFinishResult = event as unknown as typeof onFinishResult;
          },
        });
      });

      it('should stream only complete objects in partialObjectStream', async () => {
        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.partialObjectStream),
          [
            [],
            [{ content: 'element 1' }],
            [{ content: 'element 1' }, { content: 'element 2' }],
            [
              { content: 'element 1' },
              { content: 'element 2' },
              { content: 'element 3' },
            ],
          ],
        );
      });

      it('should stream only complete objects in textStream', async () => {
        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.textStream),
          [
            '[',
            '{"content":"element 1"}',
            ',{"content":"element 2"}',
            ',{"content":"element 3"}]',
          ],
        );
      });

      it('should have the correct object result', async () => {
        // consume stream
        await convertAsyncIterableToArray(result.partialObjectStream);

        expect(await result.object).toStrictEqual([
          { content: 'element 1' },
          { content: 'element 2' },
          { content: 'element 3' },
        ]);
      });

      it('should call onFinish callback with full array', async () => {
        expect(onFinishResult.object).toStrictEqual([
          { content: 'element 1' },
          { content: 'element 2' },
          { content: 'element 3' },
        ]);
      });

      it('should stream elements individually in elementStream', async () => {
        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.elementStream),
          [
            { content: 'element 1' },
            { content: 'element 2' },
            { content: 'element 3' },
          ],
        );
      });
    });

    describe('array with 2 elements streamed in 1 chunk', () => {
      let result: StreamObjectResult<
        { content: string }[],
        { content: string }[],
        AsyncIterableStream<{ content: string }>
      >;

      let onFinishResult: Parameters<
        Required<Parameters<typeof streamObject>[0]>['onFinish']
      >[0];

      beforeEach(async () => {
        result = streamObject({
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              assert.deepStrictEqual(mode, {
                type: 'object-json',
                name: undefined,
                description: undefined,
                schema: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: {
                    elements: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { content: { type: 'string' } },
                        required: ['content'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['elements'],
                  type: 'object',
                },
              });

              expect(prompt).toStrictEqual([
                {
                  role: 'system',
                  content:
                    'JSON schema:\n' +
                    `{\"$schema\":\"http://json-schema.org/draft-07/schema#\",\"type\":\"object\",\"properties\":{\"elements\":{\"type\":\"array\",\"items\":{\"type\":\"object\",\"properties\":{\"content\":{\"type\":\"string\"}},\"required\":[\"content\"],\"additionalProperties\":false}}},\"required\":[\"elements\"],\"additionalProperties\":false}` +
                    `\n` +
                    'You MUST answer with a JSON object that matches the JSON schema above.',
                },
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'prompt' }],
                  providerMetadata: undefined,
                },
              ]);

              return {
                stream: convertArrayToReadableStream([
                  {
                    type: 'text-delta',
                    textDelta:
                      '{"elements":[{"content":"element 1"},{"content":"element 2"}]}',
                  },
                  // finish
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { completionTokens: 10, promptTokens: 3 },
                  },
                ]),
                rawCall: { rawPrompt: 'prompt', rawSettings: {} },
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          output: 'array',
          mode: 'json',
          prompt: 'prompt',
          onFinish: async event => {
            onFinishResult = event as unknown as typeof onFinishResult;
          },
        });
      });

      it('should stream only complete objects in partialObjectStream', async () => {
        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.partialObjectStream),
          [[{ content: 'element 1' }, { content: 'element 2' }]],
        );
      });

      it('should stream only complete objects in textStream', async () => {
        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.textStream),
          ['[{"content":"element 1"},{"content":"element 2"}]'],
        );
      });

      it('should have the correct object result', async () => {
        // consume stream
        await convertAsyncIterableToArray(result.partialObjectStream);

        expect(await result.object).toStrictEqual([
          { content: 'element 1' },
          { content: 'element 2' },
        ]);
      });

      it('should call onFinish callback with full array', async () => {
        expect(onFinishResult.object).toStrictEqual([
          { content: 'element 1' },
          { content: 'element 2' },
        ]);
      });

      it('should stream elements individually in elementStream', async () => {
        assert.deepStrictEqual(
          await convertAsyncIterableToArray(result.elementStream),
          [{ content: 'element 1' }, { content: 'element 2' }],
        );
      });
    });
  });

  describe('output = "no-schema"', () => {
    it('should send object deltas with json mode', async () => {
      const result = streamObject({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            assert.deepStrictEqual(mode, {
              type: 'object-json',
              name: undefined,
              description: undefined,
              schema: undefined,
            });

            expect(prompt).toStrictEqual([
              {
                role: 'system',
                content: 'You MUST answer with JSON.',
              },
              {
                role: 'user',
                content: [{ type: 'text', text: 'prompt' }],
                providerMetadata: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: '{ ' },
                { type: 'text-delta', textDelta: '"content": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        output: 'no-schema',
        prompt: 'prompt',
      });

      assert.deepStrictEqual(
        await convertAsyncIterableToArray(result.partialObjectStream),
        [
          {},
          { content: 'Hello, ' },
          { content: 'Hello, world' },
          { content: 'Hello, world!' },
        ],
      );
    });
  });

  describe('telemetry', () => {
    let tracer: MockTracer;

    beforeEach(() => {
      tracer = new MockTracer();
    });

    it('should not record any telemetry data when not explicitly enabled', async () => {
      const result = streamObject({
        model: new MockLanguageModelV1({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"content": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          }),
        }),
        schema: z.object({ content: z.string() }),
        mode: 'json',
        prompt: 'prompt',
        _internal: { now: () => 0 },
      });

      // consume stream
      await convertAsyncIterableToArray(result.partialObjectStream);

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should record telemetry data when enabled with mode "json"', async () => {
      const result = streamObject({
        model: new MockLanguageModelV1({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"content": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          }),
        }),
        schema: z.object({ content: z.string() }),
        schemaName: 'test-name',
        schemaDescription: 'test description',
        mode: 'json',
        prompt: 'prompt',
        topK: 0.1,
        topP: 0.2,
        frequencyPenalty: 0.3,
        presencePenalty: 0.4,
        temperature: 0.5,
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
        _internal: { now: () => 0 },
      });

      // consume stream
      await convertAsyncIterableToArray(result.partialObjectStream);

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should record telemetry data when enabled with mode "tool"', async () => {
      const result = streamObject({
        model: new MockLanguageModelV1({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: '{ ',
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: '"content": ',
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `"Hello, `,
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `world`,
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `!"`,
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: ' }',
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          }),
        }),
        schema: z.object({ content: z.string() }),
        schemaName: 'test-name',
        schemaDescription: 'test description',
        mode: 'tool',
        prompt: 'prompt',
        topK: 0.1,
        topP: 0.2,
        frequencyPenalty: 0.3,
        presencePenalty: 0.4,
        temperature: 0.5,
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
        _internal: { now: () => 0 },
      });

      // consume stream
      await convertAsyncIterableToArray(result.partialObjectStream);

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should not record telemetry inputs / outputs when disabled with mode "json"', async () => {
      const result = streamObject({
        model: new MockLanguageModelV1({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"content": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          }),
        }),
        schema: z.object({ content: z.string() }),
        mode: 'json',
        prompt: 'prompt',
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: false,
          recordOutputs: false,
          tracer,
        },
        _internal: { now: () => 0 },
      });

      // consume stream
      await convertAsyncIterableToArray(result.partialObjectStream);

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should not record telemetry inputs / outputs when disabled with mode "tool"', async () => {
      const result = streamObject({
        model: new MockLanguageModelV1({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: '{ ',
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: '"content": ',
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `"Hello, `,
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `world`,
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `!"`,
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: ' }',
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          }),
        }),
        schema: z.object({ content: z.string() }),
        mode: 'tool',
        prompt: 'prompt',
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: false,
          recordOutputs: false,
          tracer,
        },
        _internal: { now: () => 0 },
      });

      // consume stream
      await convertAsyncIterableToArray(result.partialObjectStream);

      expect(tracer.jsonSpans).toMatchSnapshot();
    });
  });

  describe('options.messages', () => {
    it('should detect and convert ui messages', async () => {
      const result = streamObject({
        model: new MockLanguageModelV1({
          doStream: async ({ prompt }) => {
            expect(prompt).toStrictEqual([
              {
                role: 'system',
                content:
                  'JSON schema:\n' +
                  '{"type":"object","properties":{"content":{"type":"string"}},"required":["content"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}\n' +
                  'You MUST answer with a JSON object that matches the JSON schema above.',
              },
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
                { type: 'text-delta', textDelta: '{ ' },
                { type: 'text-delta', textDelta: '"content": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        schema: z.object({ content: z.string() }),
        mode: 'json',
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
        await convertAsyncIterableToArray(result.partialObjectStream),
      ).toStrictEqual([
        {},
        { content: 'Hello, ' },
        { content: 'Hello, world' },
        { content: 'Hello, world!' },
      ]);
    });
  });
});
