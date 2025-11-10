import { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { createAgentUIStreamResponse } from './create-agent-ui-stream-response';
import { ToolLoopAgent } from './tool-loop-agent';

describe('createAgentUIStreamResponse', () => {
  describe('when using tools toModelOutput', () => {
    let recordedInputs: LanguageModelV3CallOptions[];
    let response: Response;
    let decodedChunks: string[];

    beforeEach(async () => {
      recordedInputs = [];

      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV3({
          doStream: async input => {
            recordedInputs.push(input);
            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'stream-start',
                  warnings: [],
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
                  usage: {
                    inputTokens: 10,
                    outputTokens: 10,
                    totalTokens: 20,
                  },
                  providerMetadata: {
                    testProvider: { testKey: 'testValue' },
                  },
                },
              ]),
            };
          },
        }),
        tools: {
          example: tool({
            description: 'Example tool',
            inputSchema: z.object({
              input: z.string(),
            }),
            outputSchema: z.object({
              value: z.string(),
            }),
            // important: tool has toModelOutput that needs to be called
            toModelOutput: output => ({
              type: 'content',
              value: [{ type: 'text', text: output.value }],
            }),
          }),
        },
      });

      response = await createAgentUIStreamResponse({
        agent,
        messages: [
          {
            role: 'user',
            id: 'msg-1',
            parts: [
              {
                type: 'text' as const,
                text: 'Hello, world!',
              },
            ],
          },
          {
            role: 'assistant',
            id: 'msg-2',
            parts: [
              {
                type: 'tool-example' as const,
                toolCallId: 'call-1',
                state: 'output-available',
                input: {
                  input: 'Hello, world!',
                },
                output: {
                  value: 'Example tool: Hello, world!',
                },
              },
            ],
          },
        ],
      });

      // consume the response
      const decoder = new TextDecoder();
      const encodedStream = response.body!;
      const chunks = await convertReadableStreamToArray(encodedStream);
      decodedChunks = chunks.map(chunk => decoder.decode(chunk));
    });

    it('should have a single call that contains the tool result as text', () => {
      expect(recordedInputs).toMatchInlineSnapshot(`
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
                {
                  "content": [
                    {
                      "input": {
                        "input": "Hello, world!",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "example",
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
                        "type": "content",
                        "value": [
                          {
                            "text": "Example tool: Hello, world!",
                            "type": "text",
                          },
                        ],
                      },
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "example",
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
              "tools": [
                {
                  "description": "Example tool",
                  "inputSchema": {
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "additionalProperties": false,
                    "properties": {
                      "input": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "input",
                    ],
                    "type": "object",
                  },
                  "name": "example",
                  "providerOptions": undefined,
                  "type": "function",
                },
              ],
              "topK": undefined,
              "topP": undefined,
            },
          ]
        `);
    });

    it('should return the UI message stream response', () => {
      expect(decodedChunks).toMatchInlineSnapshot(`
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
          "data: {"type":"finish","finishReason":"stop"}

        ",
          "data: [DONE]

        ",
        ]
      `);
    });
  });
});
