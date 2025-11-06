import {
  JSONParseError,
  LanguageModelV3CallWarning,
  TypeValidationError,
} from '@ai-sdk/provider';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import assert, { fail } from 'node:assert';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vitest,
  vi,
} from 'vitest';
import { z } from 'zod/v4';
import { verifyNoObjectGeneratedError as originalVerifyNoObjectGeneratedError } from '../error/verify-no-object-generated-error';
import * as logWarningsModule from '../logger/log-warnings';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { MockTracer } from '../test/mock-tracer';
import { generateObject } from './generate-object';

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

const dummyResponseValues = {
  finishReason: 'stop' as const,
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  },
  response: { id: 'id-1', timestamp: new Date(123), modelId: 'm-1' },
  warnings: [],
};

describe('generateObject', () => {
  let logWarningsSpy: ReturnType<typeof vitest.spyOn>;

  beforeEach(() => {
    logWarningsSpy = vitest
      .spyOn(logWarningsModule, 'logWarnings')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    logWarningsSpy.mockRestore();
  });

  describe('output = "object"', () => {
    describe('result.object', () => {
      it('should generate object', async () => {
        const model = new MockLanguageModelV3({
          doGenerate: {
            ...dummyResponseValues,
            content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
          },
        });
        const result = await generateObject({
          model,
          schema: z.object({ content: z.string() }),
          prompt: 'prompt',
        });

        expect(result.object).toMatchInlineSnapshot(`
        {
          "content": "Hello, world!",
        }
      `);
        expect(model.doGenerateCalls[0].prompt).toMatchInlineSnapshot(`
        [
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
        ]
      `);
        expect(model.doGenerateCalls[0].responseFormat).toMatchInlineSnapshot(`
        {
          "description": undefined,
          "name": undefined,
          "schema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "content": {
                "type": "string",
              },
            },
            "required": [
              "content",
            ],
            "type": "object",
          },
          "type": "json",
        }
      `);
      });

      it('should use name and description', async () => {
        const result = await generateObject({
          model: new MockLanguageModelV3({
            doGenerate: async ({ prompt, responseFormat }) => {
              expect(responseFormat).toStrictEqual({
                type: 'json',
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
                  providerOptions: undefined,
                },
              ]);

              return {
                ...dummyResponseValues,
                content: [
                  { type: 'text', text: '{ "content": "Hello, world!" }' },
                ],
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          schemaName: 'test-name',
          schemaDescription: 'test description',
          prompt: 'prompt',
        });

        assert.deepStrictEqual(result.object, { content: 'Hello, world!' });
      });
    });

    it('should return warnings', async () => {
      const result = await generateObject({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
            warnings: [
              {
                type: 'other',
                message: 'Setting is not supported',
              },
            ],
          }),
        }),
        schema: z.object({ content: z.string() }),
        prompt: 'prompt',
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'other',
          message: 'Setting is not supported',
        },
      ]);
    });

    it('should call logWarnings with the correct warnings', async () => {
      const expectedWarnings: LanguageModelV3CallWarning[] = [
        {
          type: 'other',
          message: 'Setting is not supported',
        },
        {
          type: 'unsupported-setting',
          setting: 'temperature',
          details: 'Temperature parameter not supported',
        },
      ];

      await generateObject({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
            warnings: expectedWarnings,
          }),
        }),
        schema: z.object({ content: z.string() }),
        prompt: 'prompt',
      });

      expect(logWarningsSpy).toHaveBeenCalledOnce();
      expect(logWarningsSpy).toHaveBeenCalledWith({
        warnings: expectedWarnings,
        provider: 'mock-provider',
        model: 'mock-model-id',
      });
    });

    it('should call logWarnings with empty array when no warnings are present', async () => {
      await generateObject({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
            warnings: [], // no warnings
          }),
        }),
        schema: z.object({ content: z.string() }),
        prompt: 'prompt',
      });

      expect(logWarningsSpy).toHaveBeenCalledOnce();
      expect(logWarningsSpy).toHaveBeenCalledWith({
        warnings: [],
        provider: 'mock-provider',
        model: 'mock-model-id',
      });
    });

    describe('result.request', () => {
      it('should contain request information', async () => {
        const result = await generateObject({
          model: new MockLanguageModelV3({
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [
                { type: 'text', text: '{ "content": "Hello, world!" }' },
              ],
              request: {
                body: 'test body',
              },
            }),
          }),
          schema: z.object({ content: z.string() }),
          prompt: 'prompt',
        });

        expect(result.request).toStrictEqual({
          body: 'test body',
        });
      });
    });

    describe('result.response', () => {
      it('should contain response information', async () => {
        const result = await generateObject({
          model: new MockLanguageModelV3({
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [
                { type: 'text', text: '{ "content": "Hello, world!" }' },
              ],
              response: {
                id: 'test-id-from-model',
                timestamp: new Date(10000),
                modelId: 'test-response-model-id',
                headers: {
                  'custom-response-header': 'response-header-value',
                  'user-agent': 'ai/0.0.0-test',
                },
                body: 'test body',
              },
            }),
          }),
          schema: z.object({ content: z.string() }),
          prompt: 'prompt',
        });

        expect(result.response).toStrictEqual({
          id: 'test-id-from-model',
          timestamp: new Date(10000),
          modelId: 'test-response-model-id',
          headers: {
            'custom-response-header': 'response-header-value',
            'user-agent': 'ai/0.0.0-test',
          },
          body: 'test body',
        });
      });
    });

    describe('zod schema', () => {
      it('should generate object when using zod transform', async () => {
        const model = new MockLanguageModelV3({
          doGenerate: {
            ...dummyResponseValues,
            content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
          },
        });

        const result = await generateObject({
          model,
          schema: z.object({
            content: z
              .string()
              .transform(value => value.length)
              .pipe(z.number()),
          }),
          prompt: 'prompt',
        });

        expect(result.object).toMatchInlineSnapshot(`
        {
          "content": 13,
        }
      `);
        expect(model.doGenerateCalls[0].prompt).toMatchInlineSnapshot(`
        [
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
        ]
      `);
        expect(model.doGenerateCalls[0].responseFormat).toMatchInlineSnapshot(`
        {
          "description": undefined,
          "name": undefined,
          "schema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "content": {
                "type": "number",
              },
            },
            "required": [
              "content",
            ],
            "type": "object",
          },
          "type": "json",
        }
      `);
      });

      it('should generate object when using zod prePreprocess', async () => {
        const model = new MockLanguageModelV3({
          doGenerate: {
            ...dummyResponseValues,
            content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
          },
        });

        const result = await generateObject({
          model,
          schema: z.object({
            content: z.preprocess(
              val => (typeof val === 'number' ? String(val) : val),
              z.string(),
            ),
          }),
          prompt: 'prompt',
        });

        expect(result.object).toMatchInlineSnapshot(`
        {
          "content": "Hello, world!",
        }
      `);
        expect(model.doGenerateCalls[0].prompt).toMatchInlineSnapshot(`
        [
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
        ]
      `);
        expect(model.doGenerateCalls[0].responseFormat).toMatchInlineSnapshot(`
        {
          "description": undefined,
          "name": undefined,
          "schema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "content": {
                "type": "string",
              },
            },
            "required": [
              "content",
            ],
            "type": "object",
          },
          "type": "json",
        }
      `);
      });
    });

    describe('custom schema', () => {
      it('should generate object', async () => {
        const model = new MockLanguageModelV3({
          doGenerate: {
            ...dummyResponseValues,
            content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
          },
        });

        const result = await generateObject({
          model,
          schema: jsonSchema({
            type: 'object',
            properties: { content: { type: 'string' } },
            required: ['content'],
            additionalProperties: false,
          }),
          prompt: 'prompt',
        });

        expect(result.object).toMatchInlineSnapshot(`
        {
          "content": "Hello, world!",
        }
      `);
        expect(model.doGenerateCalls[0].prompt).toMatchInlineSnapshot(`
        [
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
        ]
      `);
        expect(model.doGenerateCalls[0].responseFormat).toMatchInlineSnapshot(`
        {
          "description": undefined,
          "name": undefined,
          "schema": {
            "additionalProperties": false,
            "properties": {
              "content": {
                "type": "string",
              },
            },
            "required": [
              "content",
            ],
            "type": "object",
          },
          "type": "json",
        }
      `);
      });
    });

    describe('result.toJsonResponse', () => {
      it('should return JSON response', async () => {
        const result = await generateObject({
          model: new MockLanguageModelV3({
            doGenerate: async ({}) => ({
              ...dummyResponseValues,
              content: [
                { type: 'text', text: '{ "content": "Hello, world!" }' },
              ],
            }),
          }),
          schema: z.object({ content: z.string() }),
          prompt: 'prompt',
        });

        const response = result.toJsonResponse();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(
          response.headers.get('Content-Type'),
          'application/json; charset=utf-8',
        );

        assert.deepStrictEqual(
          await convertReadableStreamToArray(
            response.body!.pipeThrough(new TextDecoderStream()),
          ),
          ['{"content":"Hello, world!"}'],
        );
      });
    });

    describe('result.providerMetadata', () => {
      it('should contain provider metadata', async () => {
        const result = await generateObject({
          model: new MockLanguageModelV3({
            doGenerate: async ({}) => ({
              ...dummyResponseValues,
              content: [
                { type: 'text', text: '{ "content": "Hello, world!" }' },
              ],
              providerMetadata: {
                exampleProvider: {
                  a: 10,
                  b: 20,
                },
              },
            }),
          }),
          schema: z.object({ content: z.string() }),
          prompt: 'prompt',
        });

        expect(result.providerMetadata).toStrictEqual({
          exampleProvider: {
            a: 10,
            b: 20,
          },
        });
      });
    });

    describe('options.headers', () => {
      it('should pass headers to model', async () => {
        const result = await generateObject({
          model: new MockLanguageModelV3({
            doGenerate: async ({ headers }) => {
              expect(headers).toStrictEqual({
                'custom-request-header': 'request-header-value',
                'user-agent': 'ai/0.0.0-test',
              });

              return {
                ...dummyResponseValues,
                content: [
                  { type: 'text', text: '{ "content": "headers test" }' },
                ],
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          prompt: 'prompt',
          headers: { 'custom-request-header': 'request-header-value' },
        });

        expect(result.object).toStrictEqual({ content: 'headers test' });
      });
    });

    describe('options.repairText', () => {
      it('should be able to repair a JSONParseError', async () => {
        const result = await generateObject({
          model: new MockLanguageModelV3({
            doGenerate: async ({}) => {
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'text',
                    text: '{ "content": "provider metadata test" ',
                  },
                ],
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          prompt: 'prompt',
          experimental_repairText: async ({ text, error }) => {
            expect(error).toBeInstanceOf(JSONParseError);
            expect(text).toStrictEqual(
              '{ "content": "provider metadata test" ',
            );
            return text + '}';
          },
        });

        expect(result.object).toStrictEqual({
          content: 'provider metadata test',
        });
      });

      it('should be able to repair a TypeValidationError', async () => {
        const result = await generateObject({
          model: new MockLanguageModelV3({
            doGenerate: async ({}) => {
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'text',
                    text: '{ "content-a": "provider metadata test" }',
                  },
                ],
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          prompt: 'prompt',
          experimental_repairText: async ({ text, error }) => {
            expect(error).toBeInstanceOf(TypeValidationError);
            expect(text).toStrictEqual(
              '{ "content-a": "provider metadata test" }',
            );
            return `{ "content": "provider metadata test" }`;
          },
        });

        expect(result.object).toStrictEqual({
          content: 'provider metadata test',
        });
      });

      it('should be able to handle repair that returns null', async () => {
        const result = generateObject({
          model: new MockLanguageModelV3({
            doGenerate: async ({}) => {
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'text',
                    text: '{ "content-a": "provider metadata test" }',
                  },
                ],
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          prompt: 'prompt',
          experimental_repairText: async ({ text, error }) => {
            expect(error).toBeInstanceOf(TypeValidationError);
            expect(text).toStrictEqual(
              '{ "content-a": "provider metadata test" }',
            );
            return null;
          },
        });

        expect(result).rejects.toThrow(
          'No object generated: response did not match schema.',
        );
      });
    });

    describe('options.providerOptions', () => {
      it('should pass provider options to model', async () => {
        const result = await generateObject({
          model: new MockLanguageModelV3({
            doGenerate: async ({ providerOptions }) => {
              expect(providerOptions).toStrictEqual({
                aProvider: { someKey: 'someValue' },
              });

              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'text',
                    text: '{ "content": "provider metadata test" }',
                  },
                ],
              };
            },
          }),
          schema: z.object({ content: z.string() }),
          prompt: 'prompt',
          providerOptions: {
            aProvider: { someKey: 'someValue' },
          },
        });

        expect(result.object).toStrictEqual({
          content: 'provider metadata test',
        });
      });
    });

    describe('error handling', () => {
      function verifyNoObjectGeneratedError(
        error: unknown,
        { message }: { message: string },
      ) {
        originalVerifyNoObjectGeneratedError(error, {
          message,
          response: {
            id: 'id-1',
            timestamp: new Date(123),
            modelId: 'm-1',
          },
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          },
          finishReason: 'stop',
        });
      }

      it('should throw NoObjectGeneratedError when schema validation fails', async () => {
        try {
          await generateObject({
            model: new MockLanguageModelV3({
              doGenerate: async ({}) => ({
                ...dummyResponseValues,
                content: [{ type: 'text', text: '{ "content": 123 }' }],
              }),
            }),
            schema: z.object({ content: z.string() }),
            prompt: 'prompt',
          });

          fail('must throw error');
        } catch (error) {
          verifyNoObjectGeneratedError(error, {
            message: 'No object generated: response did not match schema.',
          });
        }
      });

      it('should throw NoObjectGeneratedError when parsing fails', async () => {
        try {
          await generateObject({
            model: new MockLanguageModelV3({
              doGenerate: async ({}) => ({
                ...dummyResponseValues,
                content: [{ type: 'text', text: '{ broken json' }],
              }),
            }),
            schema: z.object({ content: z.string() }),
            prompt: 'prompt',
          });

          fail('must throw error');
        } catch (error) {
          verifyNoObjectGeneratedError(error, {
            message: 'No object generated: could not parse the response.',
          });
        }
      });

      it('should throw NoObjectGeneratedError when parsing fails with repairResponse', async () => {
        try {
          await generateObject({
            model: new MockLanguageModelV3({
              doGenerate: async ({}) => ({
                ...dummyResponseValues,
                content: [{ type: 'text', text: '{ broken json' }],
              }),
            }),
            schema: z.object({ content: z.string() }),
            prompt: 'prompt',
            experimental_repairText: async ({ text }) => text + '{',
          });

          fail('must throw error');
        } catch (error) {
          verifyNoObjectGeneratedError(error, {
            message: 'No object generated: could not parse the response.',
          });
        }
      });

      it('should throw NoObjectGeneratedError when no text is available', async () => {
        try {
          await generateObject({
            model: new MockLanguageModelV3({
              doGenerate: async ({}) => ({
                ...dummyResponseValues,
                content: [],
              }),
            }),
            schema: z.object({ content: z.string() }),
            prompt: 'prompt',
          });

          fail('must throw error');
        } catch (error) {
          verifyNoObjectGeneratedError(error, {
            message:
              'No object generated: the model did not return a response.',
          });
        }
      });
    });
  });

  describe('output = "array"', () => {
    it('should generate an array with 3 elements', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                elements: [
                  { content: 'element 1' },
                  { content: 'element 2' },
                  { content: 'element 3' },
                ],
              }),
            },
          ],
        },
      });

      const result = await generateObject({
        model,
        schema: z.object({ content: z.string() }),
        output: 'array',
        prompt: 'prompt',
      });

      expect(result.object).toMatchInlineSnapshot(`
      [
        {
          "content": "element 1",
        },
        {
          "content": "element 2",
        },
        {
          "content": "element 3",
        },
      ]
    `);
      expect(model.doGenerateCalls[0].prompt).toMatchInlineSnapshot(`
      [
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
      ]
    `);
      expect(model.doGenerateCalls[0].responseFormat).toMatchInlineSnapshot(`
      {
        "description": undefined,
        "name": undefined,
        "schema": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "additionalProperties": false,
          "properties": {
            "elements": {
              "items": {
                "additionalProperties": false,
                "properties": {
                  "content": {
                    "type": "string",
                  },
                },
                "required": [
                  "content",
                ],
                "type": "object",
              },
              "type": "array",
            },
          },
          "required": [
            "elements",
          ],
          "type": "object",
        },
        "type": "json",
      }
    `);
    });
  });

  describe('output = "enum"', () => {
    it('should generate an enum value', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ result: 'sunny' }),
            },
          ],
        },
      });

      const result = await generateObject({
        model,
        output: 'enum',
        enum: ['sunny', 'rainy', 'snowy'],
        prompt: 'prompt',
      });

      expect(result.object).toEqual('sunny');
      expect(model.doGenerateCalls[0].prompt).toMatchInlineSnapshot(`
      [
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
      ]
    `);
      expect(model.doGenerateCalls[0].responseFormat).toMatchInlineSnapshot(`
      {
        "description": undefined,
        "name": undefined,
        "schema": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "additionalProperties": false,
          "properties": {
            "result": {
              "enum": [
                "sunny",
                "rainy",
                "snowy",
              ],
              "type": "string",
            },
          },
          "required": [
            "result",
          ],
          "type": "object",
        },
        "type": "json",
      }
    `);
    });
  });

  describe('output = "no-schema"', () => {
    it('should generate object', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: {
          ...dummyResponseValues,
          content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
        },
      });

      const result = await generateObject({
        model,
        output: 'no-schema',
        prompt: 'prompt',
      });

      expect(result.object).toMatchInlineSnapshot(`
      {
        "content": "Hello, world!",
      }
    `);
      expect(model.doGenerateCalls[0].prompt).toMatchInlineSnapshot(`
      [
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
      ]
    `);
      expect(model.doGenerateCalls[0].responseFormat).toMatchInlineSnapshot(`
      undefined
    `);
    });
  });

  describe('telemetry', () => {
    let tracer: MockTracer;

    beforeEach(() => {
      tracer = new MockTracer();
    });

    it('should not record any telemetry data when not explicitly enabled', async () => {
      await generateObject({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
          }),
        }),
        schema: z.object({ content: z.string() }),
        prompt: 'prompt',
      });

      assert.deepStrictEqual(tracer.jsonSpans, []);
    });

    it('should record telemetry data when enabled', async () => {
      await generateObject({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
            response: {
              id: 'test-id-from-model',
              timestamp: new Date(10000),
              modelId: 'test-response-model-id',
            },
            providerMetadata: {
              testProvider: {
                testKey: 'testValue',
              },
            },
          }),
        }),
        schema: z.object({ content: z.string() }),
        schemaName: 'test-name',
        schemaDescription: 'test description',
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
      });

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should not record telemetry inputs / outputs when disabled', async () => {
      await generateObject({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
            response: {
              id: 'test-id-from-model',
              timestamp: new Date(10000),
              modelId: 'test-response-model-id',
            },
          }),
        }),
        schema: z.object({ content: z.string() }),
        prompt: 'prompt',
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: false,
          recordOutputs: false,
          tracer,
        },
      });

      expect(tracer.jsonSpans).toMatchSnapshot();
    });
  });

  describe('options.messages', () => {
    it('should support models that use "this" context in supportedUrls', async () => {
      let supportedUrlsCalled = false;
      class MockLanguageModelWithImageSupport extends MockLanguageModelV3 {
        constructor() {
          super({
            supportedUrls: () => {
              supportedUrlsCalled = true;
              // Reference 'this' to verify context
              return this.modelId === 'mock-model-id'
                ? ({ 'image/*': [/^https:\/\/.*$/] } as Record<
                    string,
                    RegExp[]
                  >)
                : {};
            },
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [
                { type: 'text', text: '{ "content": "Hello, world!" }' },
              ],
            }),
          });
        }
      }

      const model = new MockLanguageModelWithImageSupport();

      const result = await generateObject({
        model,
        schema: z.object({ content: z.string() }),
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', image: 'https://example.com/test.jpg' }],
          },
        ],
      });

      expect(result.object).toStrictEqual({ content: 'Hello, world!' });
      expect(supportedUrlsCalled).toBe(true);
    });
  });

  describe('reasoning', () => {
    it('should include reasoning in the result', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: async () => ({
          ...dummyResponseValues,
          content: [
            { type: 'reasoning', text: 'This is a test reasoning.' },
            { type: 'reasoning', text: 'This is another test reasoning.' },
            { type: 'text', text: '{ "content": "Hello, world!" }' },
          ],
        }),
      });

      const result = await generateObject({
        model,
        schema: z.object({ content: z.string() }),
        prompt: 'prompt',
      });

      expect(result.reasoning).toMatchInlineSnapshot(`
        "This is a test reasoning.
        This is another test reasoning."
      `);

      expect(result.object).toMatchInlineSnapshot(`
        {
          "content": "Hello, world!",
        }
      `);
    });
  });
});
