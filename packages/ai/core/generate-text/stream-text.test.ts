import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
  convertResponseStreamToArray,
} from '@ai-sdk/provider-utils/test';
import assert from 'node:assert';
import { z } from 'zod';
import { StreamData, formatStreamPart, jsonSchema } from '../../streams';
import { setTestTracer } from '../telemetry/get-tracer';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { createMockServerResponse } from '../test/mock-server-response';
import { MockTracer } from '../test/mock-tracer';
import { streamText } from './stream-text';

describe('result.textStream', () => {
  it('should send text deltas', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            tools: undefined,
            toolChoice: undefined,
          });
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
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

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.textStream),
      ['Hello', ', ', 'world!'],
    );
  });
});

describe('result.fullStream', () => {
  it('should send text deltas', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            tools: undefined,
            toolChoice: undefined,
          });
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
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

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        { type: 'text-delta', textDelta: 'Hello' },
        { type: 'text-delta', textDelta: ', ' },
        { type: 'text-delta', textDelta: 'world!' },
        {
          type: 'finish',
          finishReason: 'stop',
          logprobs: undefined,
          usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
        },
      ],
    );
  });

  it('should send tool calls', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
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

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
        },
        {
          type: 'finish',
          finishReason: 'stop',
          logprobs: undefined,
          usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
        },
      ],
    );
  });

  it('should not send tool call deltas when toolCallStreaming is disabled', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
            stream: convertArrayToReadableStream([
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

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'tool-call',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolName: 'test-tool',
          args: { value: 'Sparkle Day' },
        },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          logprobs: undefined,
          usage: { promptTokens: 53, completionTokens: 17, totalTokens: 70 },
        },
      ],
    );
  });

  it('should send tool call deltas when toolCallStreaming is enabled', async () => {
    const result = await streamText({
      experimental_toolCallStreaming: true,
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
            stream: convertArrayToReadableStream([
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

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'tool-call-streaming-start',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolName: 'test-tool',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolName: 'test-tool',
          argsTextDelta: '{"',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolName: 'test-tool',
          argsTextDelta: 'value',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolName: 'test-tool',
          argsTextDelta: '":"',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolName: 'test-tool',
          argsTextDelta: 'Spark',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolName: 'test-tool',
          argsTextDelta: 'le',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolName: 'test-tool',
          argsTextDelta: ' Day',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolName: 'test-tool',
          argsTextDelta: '"}',
        },
        {
          type: 'tool-call',
          toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
          toolName: 'test-tool',
          args: { value: 'Sparkle Day' },
        },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          logprobs: undefined,
          usage: { promptTokens: 53, completionTokens: 17, totalTokens: 70 },
        },
      ],
    );
  });

  it('should send tool results', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
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
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      tools: {
        tool1: {
          parameters: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        },
      },
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
          result: 'value-result',
        },
        {
          type: 'finish',
          finishReason: 'stop',
          logprobs: undefined,
          usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
        },
      ],
    );
  });
});

describe('result.toAIStream', () => {
  it('should transform textStream through callbacks and data transformers', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => {
          return {
            stream: convertArrayToReadableStream([
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
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        result.toAIStream().pipeThrough(new TextDecoderStream()),
      ),
      [
        formatStreamPart('text', 'Hello'),
        formatStreamPart('text', ', '),
        formatStreamPart('text', 'world!'),
        formatStreamPart('finish_message', {
          finishReason: 'stop',
          usage: { promptTokens: 3, completionTokens: 10 },
        }),
      ],
    );
  });

  it('should invoke callback', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => {
          return {
            stream: convertArrayToReadableStream([
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
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      prompt: 'test-input',
    });

    const events: string[] = [];

    await convertReadableStreamToArray(
      result
        .toAIStream({
          onStart() {
            events.push('start');
          },
          onToken(token) {
            events.push(`token:${token}`);
          },
          onText(text) {
            events.push(`text:${text}`);
          },
          onCompletion(completion) {
            events.push(`completion:${completion}`);
          },
          onFinal(completion) {
            events.push(`final:${completion}`);
          },
        })
        .pipeThrough(new TextDecoderStream()),
    );

    assert.deepStrictEqual(events, [
      'start',
      'token:Hello',
      'text:Hello',
      'token:, ',
      'text:, ',
      'token:world!',
      'text:world!',
      'completion:Hello, world!',
      'final:Hello, world!',
    ]);
  });

  it('should send tool call and tool result stream parts', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
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
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      tools: {
        tool1: {
          parameters: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        },
      },
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        result.toAIStream().pipeThrough(new TextDecoderStream()),
      ),
      [
        formatStreamPart('tool_call', {
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
        }),
        formatStreamPart('tool_result', {
          toolCallId: 'call-1',
          result: 'value-result',
        }),
        formatStreamPart('finish_message', {
          finishReason: 'stop',
          usage: { promptTokens: 3, completionTokens: 10 },
        }),
      ],
    );
  });

  it('should send tool call, tool call stream start, tool call deltas, and tool result stream parts when tool call delta flag is enabled', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
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
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
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

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        result.toAIStream().pipeThrough(new TextDecoderStream()),
      ),
      [
        formatStreamPart('tool_call_streaming_start', {
          toolCallId: 'call-1',
          toolName: 'tool1',
        }),
        formatStreamPart('tool_call_delta', {
          toolCallId: 'call-1',
          argsTextDelta: '{ "value":',
        }),
        formatStreamPart('tool_call_delta', {
          toolCallId: 'call-1',
          argsTextDelta: ' "value" }',
        }),
        formatStreamPart('tool_call', {
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
        }),
        formatStreamPart('tool_result', {
          toolCallId: 'call-1',
          result: 'value-result',
        }),
        formatStreamPart('finish_message', {
          finishReason: 'stop',
          usage: { promptTokens: 3, completionTokens: 10 },
        }),
      ],
    );
  });
});

describe('result.pipeDataStreamToResponse', async () => {
  it('should write data stream parts to a Node.js response-like object', async () => {
    const mockResponse = createMockServerResponse();

    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => {
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              { type: 'text-delta', textDelta: 'world!' },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      prompt: 'test-input',
    });

    result.pipeDataStreamToResponse(mockResponse);

    // Wait for the stream to finish writing to the mock response
    await new Promise(resolve => {
      const checkIfEnded = () => {
        if (mockResponse.ended) {
          resolve(undefined);
        } else {
          setImmediate(checkIfEnded);
        }
      };
      checkIfEnded();
    });

    const decoder = new TextDecoder();

    assert.strictEqual(mockResponse.statusCode, 200);
    assert.deepStrictEqual(mockResponse.headers, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    assert.deepStrictEqual(
      mockResponse.writtenChunks.map(chunk => decoder.decode(chunk)),
      ['0:"Hello"\n', '0:", "\n', '0:"world!"\n'],
    );
  });
});

describe('result.pipeTextStreamToResponse', async () => {
  it('should write text deltas to a Node.js response-like object', async () => {
    const mockResponse = createMockServerResponse();

    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => {
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              { type: 'text-delta', textDelta: 'world!' },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      prompt: 'test-input',
    });

    result.pipeTextStreamToResponse(mockResponse);

    // Wait for the stream to finish writing to the mock response
    await new Promise(resolve => {
      const checkIfEnded = () => {
        if (mockResponse.ended) {
          resolve(undefined);
        } else {
          setImmediate(checkIfEnded);
        }
      };
      checkIfEnded();
    });

    const decoder = new TextDecoder();

    assert.strictEqual(mockResponse.statusCode, 200);
    assert.deepStrictEqual(mockResponse.headers, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    assert.deepStrictEqual(
      mockResponse.writtenChunks.map(chunk => decoder.decode(chunk)),
      ['Hello', ', ', 'world!'],
    );
  });
});

describe('result.toDataStreamResponse', () => {
  it('should create a Response with a data stream', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: 'world!' },
          ]),
          rawCall: { rawPrompt: 'prompt', rawSettings: {} },
        }),
      }),
      prompt: 'test-input',
    });

    const response = result.toDataStreamResponse();

    assert.strictEqual(response.status, 200);

    assert.deepStrictEqual(Object.fromEntries(response.headers.entries()), {
      'content-type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
    });

    assert.strictEqual(
      response.headers.get('Content-Type'),
      'text/plain; charset=utf-8',
    );

    assert.deepStrictEqual(await convertResponseStreamToArray(response), [
      '0:"Hello"\n',
      '0:", "\n',
      '0:"world!"\n',
    ]);
  });

  it('should create a Response with a data stream and custom headers', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: 'world!' },
          ]),
          rawCall: { rawPrompt: 'prompt', rawSettings: {} },
        }),
      }),
      prompt: 'test-input',
    });

    const response = result.toDataStreamResponse({
      status: 201,
      statusText: 'foo',
      headers: {
        'custom-header': 'custom-value',
      },
    });

    assert.strictEqual(response.status, 201);
    assert.strictEqual(response.statusText, 'foo');

    assert.deepStrictEqual(Object.fromEntries(response.headers.entries()), {
      'content-type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
      'custom-header': 'custom-value',
    });

    assert.deepStrictEqual(await convertResponseStreamToArray(response), [
      '0:"Hello"\n',
      '0:", "\n',
      '0:"world!"\n',
    ]);
  });

  it('should support merging with existing stream data', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: 'world!' },
          ]),
          rawCall: { rawPrompt: 'prompt', rawSettings: {} },
        }),
      }),
      prompt: 'test-input',
    });

    const streamData = new StreamData();
    streamData.append('stream-data-value');
    streamData.close();

    const response = result.toDataStreamResponse({ data: streamData });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      response.headers.get('Content-Type'),
      'text/plain; charset=utf-8',
    );

    const chunks = await convertResponseStreamToArray(response);

    assert.deepStrictEqual(chunks, [
      '2:["stream-data-value"]\n',
      '0:"Hello"\n',
      '0:", "\n',
      '0:"world!"\n',
    ]);
  });

  it('should mask error messages by default', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
          rawCall: { rawPrompt: 'prompt', rawSettings: {} },
        }),
      }),
      prompt: 'test-input',
    });

    const response = result.toDataStreamResponse();

    assert.deepStrictEqual(await convertResponseStreamToArray(response), [
      '3:""\n',
    ]);
  });

  it('should support custom error messages', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'error', error: 'error' },
          ]),
          rawCall: { rawPrompt: 'prompt', rawSettings: {} },
        }),
      }),
      prompt: 'test-input',
    });

    const response = result.toDataStreamResponse({
      getErrorMessage: error => `custom error message: ${error}`,
    });

    assert.deepStrictEqual(await convertResponseStreamToArray(response), [
      '3:"custom error message: error"\n',
    ]);
  });
});

describe('result.toTextStreamResponse', () => {
  it('should create a Response with a text stream', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => {
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              { type: 'text-delta', textDelta: 'world!' },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      prompt: 'test-input',
    });

    const response = result.toTextStreamResponse();

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(Object.fromEntries(response.headers.entries()), {
      'content-type': 'text/plain; charset=utf-8',
    });

    assert.deepStrictEqual(await convertResponseStreamToArray(response), [
      'Hello',
      ', ',
      'world!',
    ]);
  });
});

describe('multiple stream consumption', () => {
  it('should support text stream, ai stream, full stream on single result object', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async () => {
          return {
            stream: convertArrayToReadableStream([
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
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.textStream),
      ['Hello', ', ', 'world!'],
    );

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        result.toAIStream().pipeThrough(new TextDecoderStream()),
      ),
      [
        formatStreamPart('text', 'Hello'),
        formatStreamPart('text', ', '),
        formatStreamPart('text', 'world!'),
        formatStreamPart('finish_message', {
          finishReason: 'stop',
          usage: { promptTokens: 3, completionTokens: 10 },
        }),
      ],
    );

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        { type: 'text-delta', textDelta: 'Hello' },
        { type: 'text-delta', textDelta: ', ' },
        { type: 'text-delta', textDelta: 'world!' },
        {
          type: 'finish',
          finishReason: 'stop',
          logprobs: undefined,
          usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
        },
      ],
    );
  });
});

describe('result.usage', () => {
  it('should resolve with token usage', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            tools: undefined,
            toolChoice: undefined,
          });
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
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
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            tools: undefined,
            toolChoice: undefined,
          });
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
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

    // consume stream (runs in parallel)
    convertAsyncIterableToArray(result.textStream);

    assert.strictEqual(await result.finishReason, 'stop');
  });
});

describe('result.text', () => {
  it('should resolve with full text', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            tools: undefined,
            toolChoice: undefined,
          });
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
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

    // consume stream (runs in parallel)
    convertAsyncIterableToArray(result.textStream);

    assert.strictEqual(await result.text, 'Hello, world!');
  });
});

describe('result.toolCalls', () => {
  it('should resolve with tool calls', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
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
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
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

    assert.deepStrictEqual(await result.toolCalls, [
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
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
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
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
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

describe('options.onFinish', () => {
  let result: Parameters<
    Required<Parameters<typeof streamText>[0]>['onFinish']
  >[0];

  beforeEach(async () => {
    const { textStream } = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
            stream: convertArrayToReadableStream([
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
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
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

    // consume stream
    await convertAsyncIterableToArray(textStream);
  });

  it('should contain token usage', async () => {
    assert.deepStrictEqual(result.usage, {
      completionTokens: 10,
      promptTokens: 3,
      totalTokens: 13,
    });
  });

  it('should contain finish reason', async () => {
    assert.strictEqual(result.finishReason, 'stop');
  });

  it('should contain full text', async () => {
    assert.strictEqual(result.text, 'Hello, world!');
  });

  it('should contain tool calls', async () => {
    assert.deepStrictEqual(result.toolCalls, [
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'tool1',
        args: { value: 'value' },
      },
    ]);
  });

  it('should contain tool results', async () => {
    assert.deepStrictEqual(result.toolResults, [
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

describe('options.headers', () => {
  it('should set headers', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ headers }) => {
          assert.deepStrictEqual(headers, {
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

describe('telemetry', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
    setTestTracer(tracer);
  });

  afterEach(() => {
    setTestTracer(undefined);
  });

  it('should not record any telemetry data when not explicitly enabled', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({}) => ({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: `world!` },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 20, promptTokens: 10 },
            },
          ]),
          rawCall: { rawPrompt: 'prompt', rawSettings: {} },
        }),
      }),
      prompt: 'test-input',
    });

    // consume stream
    await convertAsyncIterableToArray(result.textStream);

    assert.deepStrictEqual(tracer.jsonSpans, []);
  });

  it('should record telemetry data when enabled', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({}) => ({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: `world!` },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 20, promptTokens: 10 },
            },
          ]),
          rawCall: { rawPrompt: 'prompt', rawSettings: {} },
        }),
      }),
      prompt: 'test-input',
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
      },
    });

    // consume stream
    await convertAsyncIterableToArray(result.textStream);

    assert.deepStrictEqual(tracer.jsonSpans, [
      {
        name: 'ai.streamText',
        attributes: {
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.prompt': '{"prompt":"test-input"}',
          'ai.telemetry.functionId': 'test-function-id',
          'ai.telemetry.metadata.test1': 'value1',
          'ai.telemetry.metadata.test2': false,
          'ai.finishReason': 'stop',
          'ai.result.text': 'Hello, world!',
          'ai.usage.completionTokens': 20,
          'ai.usage.promptTokens': 10,
          'ai.request.headers.header1': 'value1',
          'ai.request.headers.header2': 'value2',
          'operation.name': 'ai.streamText test-function-id',
          'resource.name': 'test-function-id',
        },
        events: [],
      },
      {
        name: 'ai.streamText.doStream',
        attributes: {
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.prompt.format': 'prompt',
          'ai.prompt.messages':
            '[{"role":"user","content":[{"type":"text","text":"test-input"}]}]',
          'ai.telemetry.functionId': 'test-function-id',
          'ai.telemetry.metadata.test1': 'value1',
          'ai.telemetry.metadata.test2': false,
          'ai.finishReason': 'stop',
          'ai.result.text': 'Hello, world!',
          'ai.usage.completionTokens': 20,
          'ai.usage.promptTokens': 10,
          'ai.request.headers.header1': 'value1',
          'ai.request.headers.header2': 'value2',
          'operation.name': 'ai.streamText.doStream test-function-id',
          'resource.name': 'test-function-id',
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.completion_tokens': 20,
          'gen_ai.usage.prompt_tokens': 10,
        },
        events: ['ai.stream.firstChunk'],
      },
    ]);
  });

  it('should record successful tool call', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({}) => ({
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
              usage: { completionTokens: 20, promptTokens: 10 },
            },
          ]),
          rawCall: { rawPrompt: 'prompt', rawSettings: {} },
        }),
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
      },
    });

    // consume stream
    await convertAsyncIterableToArray(result.textStream);

    assert.deepStrictEqual(tracer.jsonSpans, [
      {
        name: 'ai.streamText',
        attributes: {
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.prompt': '{"prompt":"test-input"}',
          'ai.finishReason': 'stop',
          'ai.result.text': '',
          'ai.result.toolCalls':
            '[{"type":"tool-call","toolCallId":"call-1","toolName":"tool1","args":{"value":"value"}}]',
          'ai.usage.completionTokens': 20,
          'ai.usage.promptTokens': 10,
          'operation.name': 'ai.streamText',
        },
        events: [],
      },
      {
        name: 'ai.streamText.doStream',
        attributes: {
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.prompt.format': 'prompt',
          'ai.prompt.messages':
            '[{"role":"user","content":[{"type":"text","text":"test-input"}]}]',
          'ai.finishReason': 'stop',
          'ai.result.text': '',
          'ai.result.toolCalls':
            '[{"type":"tool-call","toolCallId":"call-1","toolName":"tool1","args":{"value":"value"}}]',
          'ai.usage.completionTokens': 20,
          'ai.usage.promptTokens': 10,
          'operation.name': 'ai.streamText.doStream',
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.completion_tokens': 20,
          'gen_ai.usage.prompt_tokens': 10,
        },
        events: ['ai.stream.firstChunk'],
      },
      {
        name: 'ai.toolCall',
        attributes: {
          'operation.name': 'ai.toolCall',
          'ai.toolCall.name': 'tool1',
          'ai.toolCall.id': 'call-1',
          'ai.toolCall.args': '{"value":"value"}',
          'ai.toolCall.result': '"value-result"',
        },
        events: [],
      },
    ]);
  });

  it('should not record telemetry inputs / outputs when disabled', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({}) => ({
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
              usage: { completionTokens: 20, promptTokens: 10 },
            },
          ]),
          rawCall: { rawPrompt: 'prompt', rawSettings: {} },
        }),
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
      },
    });

    // consume stream
    await convertAsyncIterableToArray(result.textStream);

    assert.deepStrictEqual(tracer.jsonSpans, [
      {
        name: 'ai.streamText',
        attributes: {
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.finishReason': 'stop',
          'ai.usage.completionTokens': 20,
          'ai.usage.promptTokens': 10,
          'operation.name': 'ai.streamText',
        },
        events: [],
      },
      {
        name: 'ai.streamText.doStream',
        attributes: {
          'operation.name': 'ai.streamText.doStream',
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.finishReason': 'stop',
          'ai.usage.completionTokens': 20,
          'ai.usage.promptTokens': 10,
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.completion_tokens': 20,
          'gen_ai.usage.prompt_tokens': 10,
        },
        events: ['ai.stream.firstChunk'],
      },
      {
        name: 'ai.toolCall',
        attributes: {
          'operation.name': 'ai.toolCall',
          'ai.toolCall.name': 'tool1',
          'ai.toolCall.id': 'call-1',
        },
        events: [],
      },
    ]);
  });
});

describe('tools with custom schema', () => {
  it('should send tool calls', async () => {
    const result = await streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
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
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
        },
        {
          type: 'finish',
          finishReason: 'stop',
          logprobs: undefined,
          usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
        },
      ],
    );
  });
});
