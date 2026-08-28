import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import {
  isProviderStreamError,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createOpenResponsesExtensionRegistry,
  type OpenResponsesExtension,
} from '../open-responses-extension';
import type { OpenResponsesLanguageModelOptions } from './open-responses-language-model-options';
import { OpenResponsesLanguageModel } from './open-responses-language-model';

describe('OpenResponsesLanguageModel', () => {
  const TEST_PROMPT: LanguageModelV4Prompt = [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ];
  type AssistantContent = Extract<
    LanguageModelV4Prompt[number],
    { role: 'assistant' }
  >['content'];

  const URL = 'https://localhost:1234/v1/responses';

  const server = createTestServer({
    [URL]: {},
  });

  function createModel(
    modelId: string = 'gemma-7b-it',
    extensions?: readonly OpenResponsesExtension[],
  ) {
    return new OpenResponsesLanguageModel(modelId, {
      provider: 'lmstudio',
      providerOptionsName: 'lmstudio',
      url: URL,
      headers: () => ({}),
      generateId: mockId(),
      extensionRegistry: createOpenResponsesExtensionRegistry(extensions),
    });
  }

  function createDocumentSearchExtension({
    providerExecuted,
  }: {
    providerExecuted: boolean;
  }): OpenResponsesExtension {
    return {
      id: 'acme.document_search',
      toolType: 'acme:document_search',
      itemTypes: [
        'acme:document_search_call',
        'acme:document_search_result',
        'acme:document_search_receipt',
      ],
      eventTypes: ['acme:document_search_input'],
      encodeTool: ({ name, args }) => ({
        name,
        ...(args as {}),
      }),
      encodeToolChoice: ({ name }) => ({ name }),
      decodeItem: ({ item }) => {
        if (item.type === 'acme:document_search_call') {
          return [
            {
              type: 'tool-call',
              toolCallId: item.call_id as string,
              toolName: item.name as string,
              input: JSON.stringify(item.query),
              providerExecuted:
                typeof item.provider_executed === 'boolean'
                  ? item.provider_executed
                  : providerExecuted,
            },
          ];
        }

        if (item.type === 'acme:document_search_result') {
          return [
            {
              type: 'tool-result',
              toolCallId: item.call_id as string,
              toolName: item.name as string,
              result: item.result!,
            },
          ];
        }

        return [
          {
            type: 'tool-call',
            toolCallId: item.call_id as string,
            toolName: item.name as string,
            input: JSON.stringify(item.query),
            providerExecuted:
              typeof item.provider_executed === 'boolean'
                ? item.provider_executed
                : providerExecuted,
          },
          {
            type: 'tool-result',
            toolCallId: item.call_id as string,
            toolName: item.name as string,
            result: item.result!,
          },
        ];
      },
      encodeInputItem: ({ part }) => {
        if (part.type === 'tool-call') {
          return {
            type: 'acme:document_search_call',
            id: `call_item_${part.toolCallId}`,
            status: 'completed',
            call_id: part.toolCallId,
            name: part.toolName,
            query: part.input as never,
          };
        }

        if (part.type === 'tool-result') {
          return {
            type: 'acme:document_search_result',
            id: `result_item_${part.toolCallId}`,
            status: 'completed',
            call_id: part.toolCallId,
            name: part.toolName,
            result: part.output as never,
          };
        }
      },
      decodeEvent: ({ event }) => [
        {
          type: 'tool-input-start',
          id: event.call_id as string,
          toolName: event.name as string,
          providerExecuted:
            typeof event.provider_executed === 'boolean'
              ? event.provider_executed
              : providerExecuted,
        },
        {
          type: 'tool-input-delta',
          id: event.call_id as string,
          delta: event.delta as string,
        },
        {
          type: 'tool-input-end',
          id: event.call_id as string,
        },
      ],
    };
  }

  it('should reject workflow serialization when extension codecs are registered', () => {
    const model = createModel('gemma-7b-it', [
      createDocumentSearchExtension({ providerExecuted: true }),
    ]);

    expect(() => OpenResponsesLanguageModel[WORKFLOW_SERIALIZE](model)).toThrow(
      'Open Responses models with registered extensions cannot be serialized across workflow boundaries.',
    );
  });

  describe('doGenerate', () => {
    function prepareJsonFixtureResponse(filename: string) {
      server.urls[URL].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync(
            `src/responses/__fixtures__/${filename}.json`,
            'utf8',
          ),
        ),
      };
      return;
    }

    function prepareOutputResponse(output: Array<Record<string, unknown>>) {
      server.urls[URL].response = {
        type: 'json-value',
        body: {
          id: 'resp_1',
          object: 'response',
          created_at: 0,
          model: 'test-model',
          status: 'completed',
          output,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
          },
        },
      };
    }

    it('should throw a descriptive error when the response has no output', async () => {
      server.urls[URL].response = {
        type: 'json-value',
        body: {
          id: 'resp_no_output',
          created_at: 1741257730,
          model: 'gemma-7b-it',
          status: 'incomplete',
          incomplete_details: { reason: 'content_filter' },
          // no `output` field
          usage: {
            input_tokens: 10,
            output_tokens: 0,
          },
        },
      };

      await expect(
        createModel().doGenerate({ prompt: TEST_PROMPT }),
      ).rejects.toThrow('Responses API returned no output (content_filter)');
    });

    it('should surface response.error message before the no-output fallback', async () => {
      server.urls[URL].response = {
        type: 'json-value',
        body: {
          id: 'resp_error',
          created_at: 1741257730,
          model: 'gemma-7b-it',
          status: 'failed',
          error: {
            code: 'server_error',
            message: 'The upstream provider failed to generate a response.',
          },
          // no `output` field
          usage: {
            input_tokens: 10,
            output_tokens: 0,
          },
        },
      };

      await expect(
        createModel().doGenerate({ prompt: TEST_PROMPT }),
      ).rejects.toThrow('The upstream provider failed to generate a response.');
    });

    describe('basic generation', () => {
      let result: LanguageModelV4GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });
      });

      it('should send correct request body', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should produce correct content', async () => {
        expect(result.content).toMatchSnapshot();
      });

      it('should extract usage correctly', async () => {
        expect(result.usage).toMatchSnapshot();
      });
    });

    describe('manual history replay', () => {
      it('should preserve output item order and ids', async () => {
        prepareOutputResponse([
          {
            id: 'rs_1',
            type: 'reasoning',
            status: 'completed',
            summary: [],
            content: [{ type: 'reasoning_text', text: 'reasoning' }],
          },
          {
            id: 'fc_1',
            type: 'function_call',
            status: 'completed',
            call_id: 'call_1',
            name: 'search',
            arguments: '{}',
          },
          {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: 'answer after the call',
                annotations: [],
              },
            ],
          },
        ]);

        const model = createModel();
        const first = await model.doGenerate({ prompt: TEST_PROMPT });

        await model.doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: first.content as AssistantContent,
            },
          ],
        });

        expect((await server.calls[1].requestBodyJson).input).toEqual([
          {
            id: 'rs_1',
            type: 'reasoning',
            summary: [],
            content: [{ type: 'reasoning_text', text: 'reasoning' }],
          },
          {
            id: 'fc_1',
            type: 'function_call',
            call_id: 'call_1',
            name: 'search',
            arguments: '{}',
          },
          {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'answer after the call',
              },
            ],
          },
        ]);
      });

      it('should preserve summary and encrypted-only reasoning items', async () => {
        prepareOutputResponse([
          {
            id: 'rs_2',
            type: 'reasoning',
            status: 'completed',
            summary: [{ type: 'summary_text', text: 'safe summary' }],
            encrypted_content: 'opaque-provider-state',
          },
        ]);

        const model = createModel();
        const first = await model.doGenerate({ prompt: TEST_PROMPT });

        expect(first.content).toEqual([
          {
            type: 'reasoning',
            text: 'safe summary',
            providerMetadata: {
              lmstudio: {
                itemId: 'rs_2',
                reasoningContent: null,
                reasoningSummary: [
                  { type: 'summary_text', text: 'safe summary' },
                ],
                reasoningEncryptedContent: 'opaque-provider-state',
              },
            },
          },
        ]);

        await model.doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: first.content as AssistantContent,
            },
          ],
        });

        expect((await server.calls[1].requestBodyJson).input).toEqual([
          {
            id: 'rs_2',
            type: 'reasoning',
            summary: [{ type: 'summary_text', text: 'safe summary' }],
            encrypted_content: 'opaque-provider-state',
          },
        ]);
      });

      it('should preserve output text annotations', async () => {
        const annotation = {
          type: 'url_citation',
          start_index: 0,
          end_index: 7,
          url: 'https://example.com/source',
          title: 'Example source',
        };
        prepareOutputResponse([
          {
            id: 'msg_annotated',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: 'Sourced answer',
                annotations: [annotation],
              },
            ],
          },
        ]);

        const model = createModel();
        const first = await model.doGenerate({ prompt: TEST_PROMPT });

        expect(first.content).toEqual([
          {
            type: 'text',
            text: 'Sourced answer',
            providerMetadata: {
              lmstudio: {
                itemId: 'msg_annotated',
                annotations: [annotation],
              },
            },
          },
        ]);

        await model.doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: first.content as AssistantContent,
            },
          ],
        });

        expect((await server.calls[1].requestBodyJson).input).toEqual([
          {
            id: 'msg_annotated',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Sourced answer',
                annotations: [annotation],
              },
            ],
          },
        ]);
      });

      it('should preserve reasoning content part boundaries', async () => {
        prepareOutputResponse([
          {
            id: 'rs_multiple',
            type: 'reasoning',
            status: 'completed',
            summary: [],
            content: [
              { type: 'reasoning_text', text: 'First thought. ' },
              { type: 'reasoning_text', text: 'Second thought.' },
            ],
          },
        ]);

        const model = createModel();
        const first = await model.doGenerate({ prompt: TEST_PROMPT });

        expect(first.content).toHaveLength(2);
        expect(first.content.map(part => part.type)).toEqual([
          'reasoning',
          'reasoning',
        ]);
        expect(
          first.content.map(part =>
            part.type === 'reasoning' ? part.text : undefined,
          ),
        ).toEqual(['First thought. ', 'Second thought.']);

        await model.doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: first.content as AssistantContent,
            },
          ],
        });

        expect((await server.calls[1].requestBodyJson).input).toEqual([
          {
            id: 'rs_multiple',
            type: 'reasoning',
            summary: [],
            content: [
              { type: 'reasoning_text', text: 'First thought. ' },
              { type: 'reasoning_text', text: 'Second thought.' },
            ],
          },
        ]);
      });

      it('should decode and losslessly replay a registered hosted-tool receipt', async () => {
        const receipt = {
          id: 'search_1',
          type: 'acme:document_search_receipt',
          status: 'completed',
          call_id: 'call_1',
          name: 'documentSearch',
          provider_executed: false,
          query: { text: 'climate' },
          result: {
            documents: [{ id: 'doc_1', score: 0.9 }],
          },
          opaque_receipt: {
            trace_id: 'trace_1',
            implementation_version: 3,
          },
        };
        prepareOutputResponse([receipt]);

        const model = createModel('gemma-7b-it', [
          createDocumentSearchExtension({ providerExecuted: true }),
        ]);
        const first = await model.doGenerate({ prompt: TEST_PROMPT });

        expect(first.content).toEqual([
          {
            type: 'custom',
            kind: 'open-responses.extension-replay',
            providerMetadata: {
              lmstudio: {
                openResponsesExtension: {
                  id: 'acme.document_search',
                  item: receipt,
                },
              },
            },
          },
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'documentSearch',
            input: '{"text":"climate"}',
            providerExecuted: false,
            providerMetadata: {
              lmstudio: {
                openResponsesExtension: {
                  id: 'acme.document_search',
                  itemId: 'search_1',
                },
              },
            },
          },
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'documentSearch',
            result: {
              documents: [{ id: 'doc_1', score: 0.9 }],
            },
            providerMetadata: {
              lmstudio: {
                openResponsesExtension: {
                  id: 'acme.document_search',
                  itemId: 'search_1',
                },
              },
            },
          },
        ]);

        await model.doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'custom',
                  kind: 'open-responses.extension-replay',
                  providerOptions: first.content[0].providerMetadata,
                },
                {
                  type: 'tool-call',
                  toolCallId: 'call_1',
                  toolName: 'documentSearch',
                  input: { text: 'climate' },
                  providerExecuted: false,
                  providerOptions: first.content[1].providerMetadata,
                },
                {
                  type: 'tool-result',
                  toolCallId: 'call_1',
                  toolName: 'documentSearch',
                  output: {
                    type: 'json',
                    value: {
                      documents: [{ id: 'doc_1', score: 0.9 }],
                    },
                  },
                  providerOptions: first.content[2].providerMetadata,
                },
              ],
            },
          ],
        });

        expect((await server.calls[1].requestBodyJson).input).toEqual([
          receipt,
        ]);
      });

      it('should replay a source-only extension item through response history', async () => {
        const sourceItem = {
          id: 'source_1',
          type: 'acme:document_search_receipt',
          status: 'completed',
          url: 'https://example.com/documentation',
          title: 'Extension documentation',
          opaque_receipt: {
            trace_id: 'trace_source_1',
          },
        };
        prepareOutputResponse([sourceItem]);

        const extension = createDocumentSearchExtension({
          providerExecuted: true,
        });
        extension.decodeItem = ({ item }) => [
          {
            type: 'source',
            sourceType: 'url',
            id: item.id,
            url: item.url as string,
            title: item.title as string,
          },
        ];

        const model = createModel('gemma-7b-it', [extension]);
        const first = await model.doGenerate({ prompt: TEST_PROMPT });

        expect(first.content).toEqual([
          {
            type: 'custom',
            kind: 'open-responses.extension-replay',
            providerMetadata: {
              lmstudio: {
                openResponsesExtension: {
                  id: 'acme.document_search',
                  item: sourceItem,
                },
              },
            },
          },
          {
            type: 'source',
            sourceType: 'url',
            id: 'source_1',
            url: 'https://example.com/documentation',
            title: 'Extension documentation',
            providerMetadata: {
              lmstudio: {
                openResponsesExtension: {
                  id: 'acme.document_search',
                  itemId: 'source_1',
                },
              },
            },
          },
        ]);

        await model.doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'custom',
                  kind: 'open-responses.extension-replay',
                  providerOptions: first.content[0].providerMetadata,
                },
              ],
            },
          ],
        });

        expect((await server.calls[1].requestBodyJson).input).toEqual([
          sourceItem,
        ]);
      });

      it('should encode client-executed extension calls and results without original wire metadata', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel('gemma-7b-it', [
          createDocumentSearchExtension({ providerExecuted: false }),
        ]).doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call_client',
                  toolName: 'documentSearch',
                  input: { text: 'weather' },
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call_client',
                  toolName: 'documentSearch',
                  output: {
                    type: 'json',
                    value: { documents: ['forecast'] },
                  },
                },
              ],
            },
          ],
          tools: [
            {
              type: 'provider',
              id: 'acme.document_search',
              name: 'documentSearch',
              args: {},
            },
          ],
        });

        expect((await server.calls[0].requestBodyJson).input).toEqual([
          {
            type: 'acme:document_search_call',
            id: 'call_item_call_client',
            status: 'completed',
            call_id: 'call_client',
            name: 'documentSearch',
            query: { text: 'weather' },
          },
          {
            type: 'acme:document_search_result',
            id: 'result_item_call_client',
            status: 'completed',
            call_id: 'call_client',
            name: 'documentSearch',
            result: {
              type: 'json',
              value: { documents: ['forecast'] },
            },
          },
        ]);
      });
    });

    describe('request parameters', () => {
      let result: LanguageModelV4GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          maxOutputTokens: 100,
          temperature: 0.5,
          topP: 0.9,
          presencePenalty: 0.1,
          frequencyPenalty: 0.2,
          responseFormat: {
            type: 'json',
            name: 'response',
            description: 'Example response schema',
            schema: {
              type: 'object',
              properties: {
                status: { type: 'string' },
              },
              required: ['status'],
            },
          },
        });
      });

      it('should send correct request body', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });

    describe('tools', () => {
      let result: LanguageModelV4GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the current weather for a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state',
                  },
                },
                required: ['location'],
              },
            },
            {
              type: 'function',
              name: 'search',
              description: 'Search for information',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                  },
                },
                required: ['query'],
              },
              strict: true,
            },
            {
              type: 'provider',
              id: 'openai.web_search',
              name: 'web_search',
              args: {},
            },
            {
              type: 'provider',
              id: 'openai.file_search',
              name: 'file_search',
              args: { vectorStoreIds: ['vs_123'] },
            },
          ],
        });
      });

      it('should send correct request body with tools', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should warn for each unsupported provider-defined tool', async () => {
        expect(result.warnings).toMatchInlineSnapshot(`
          [
            {
              "feature": "provider-defined tool openai.web_search",
              "type": "unsupported",
            },
            {
              "feature": "provider-defined tool openai.file_search",
              "type": "unsupported",
            },
          ]
        `);
      });

      it('should encode registered provider tools and preserve warnings for unregistered tools', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        const result = await createModel('gemma-7b-it', [
          createDocumentSearchExtension({ providerExecuted: true }),
        ]).doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'lookup',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              type: 'provider',
              id: 'acme.document_search',
              name: 'documentSearch',
              args: { index: 'docs' },
            },
            {
              type: 'provider',
              id: 'acme.unregistered',
              name: 'unregistered',
              args: {},
            },
          ],
          toolChoice: { type: 'tool', toolName: 'documentSearch' },
        });

        const requestBody = await server.calls.at(-1)!.requestBodyJson;
        expect(requestBody.tools).toEqual([
          {
            type: 'function',
            name: 'lookup',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'acme:document_search',
            name: 'documentSearch',
            index: 'docs',
          },
        ]);
        expect(requestBody.tool_choice).toEqual({
          type: 'acme:document_search',
          name: 'documentSearch',
        });
        expect(result.warnings).toEqual([
          {
            type: 'unsupported',
            feature: 'provider-defined tool acme.unregistered',
          },
        ]);
      });

      it('should warn and omit a registered provider tool and its selected choice when it cannot be encoded', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');
        const extension = createDocumentSearchExtension({
          providerExecuted: true,
        });
        extension.encodeTool = () => undefined;

        const result = await createModel('gemma-7b-it', [extension]).doGenerate(
          {
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'acme.document_search',
                name: 'documentSearch',
                args: {},
              },
            ],
            toolChoice: { type: 'tool', toolName: 'documentSearch' },
          },
        );

        const requestBody = await server.calls.at(-1)!.requestBodyJson;
        expect(requestBody.tools).toBeUndefined();
        expect(requestBody.tool_choice).toBeUndefined();
        expect(result.warnings).toEqual([
          {
            type: 'unsupported',
            feature: 'provider-defined tool acme.document_search',
          },
        ]);
      });

      it('should omit a selected unregistered provider tool choice', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'acme.unregistered',
              name: 'unregistered',
              args: {},
            },
          ],
          toolChoice: { type: 'tool', toolName: 'unregistered' },
        });

        const requestBody = await server.calls.at(-1)!.requestBodyJson;
        expect(requestBody.tools).toBeUndefined();
        expect(requestBody.tool_choice).toBeUndefined();
        expect(result.warnings).toEqual([
          {
            type: 'unsupported',
            feature: 'provider-defined tool acme.unregistered',
          },
        ]);
      });
    });

    describe('top-level reasoning', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('lmstudio-basic.1');
      });

      it('should map top-level reasoning to reasoning effort', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'high',
        });

        expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual(
          { effort: 'high' },
        );
      });

      it('should coerce top-level reasoning minimal to low', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'minimal',
        });

        expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual(
          { effort: 'low' },
        );
      });

      it('should map top-level reasoning none to none', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'none',
        });

        expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual(
          { effort: 'none' },
        );
      });

      it('should pass xhigh directly', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'xhigh',
        });

        expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual(
          { effort: 'xhigh' },
        );
      });

      it('should not set reasoning when not specified', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(
          (await server.calls[0].requestBodyJson).reasoning,
        ).toBeUndefined();
      });
    });

    describe('providerOptions reasoning', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('lmstudio-basic.1');
      });

      it('should send a provider-native reasoning effort', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            lmstudio: {
              reasoningEffort: 'max',
            } satisfies OpenResponsesLanguageModelOptions,
          },
        });

        expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual(
          { effort: 'max' },
        );
      });

      it('should prefer providerOptions reasoning effort over top-level reasoning', async () => {
        const { warnings } = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'low',
          providerOptions: {
            lmstudio: {
              reasoningEffort: 'max',
              reasoningSummary: 'detailed',
            } satisfies OpenResponsesLanguageModelOptions,
          },
        });

        expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual(
          {
            effort: 'max',
            summary: 'detailed',
          },
        );
        expect(warnings).toStrictEqual([]);
      });

      it('should send reasoning.summary via providerOptions', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            lmstudio: { reasoningSummary: 'detailed' },
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
                "type": "message",
              },
            ],
            "model": "gemma-7b-it",
            "reasoning": {
              "summary": "detailed",
            },
          }
        `);
      });

      it('should combine top-level reasoning effort with providerOptions summary', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'high',
          providerOptions: {
            lmstudio: { reasoningSummary: 'auto' },
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
                "type": "message",
              },
            ],
            "model": "gemma-7b-it",
            "reasoning": {
              "effort": "high",
              "summary": "auto",
            },
          }
        `);
      });

      it('should send reasoning.summary concise via providerOptions', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            lmstudio: { reasoningSummary: 'concise' },
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
                "type": "message",
              },
            ],
            "model": "gemma-7b-it",
            "reasoning": {
              "summary": "concise",
            },
          }
        `);
      });

      it('should not set reasoning when providerOptions has no reasoning fields', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            lmstudio: {},
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
                "type": "message",
              },
            ],
            "model": "gemma-7b-it",
          }
        `);
      });
    });

    describe('tool call parsing', () => {
      let result: LanguageModelV4GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-tool-call.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'Get the weather in a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The location to get the weather for',
                  },
                },
                required: ['location'],
              },
            },
          ],
          toolChoice: { type: 'required' },
        });
      });

      it('should parse tool call from response', async () => {
        expect(result.content).toMatchSnapshot();
      });

      it('should return tool-calls finish reason', async () => {
        expect(result.finishReason).toStrictEqual({
          unified: 'tool-calls',
          raw: undefined,
        });
      });

      it('should extract usage correctly', async () => {
        expect(result.usage).toMatchSnapshot();
      });
    });

    describe('tool choice', () => {
      const TEST_TOOL = {
        type: 'function' as const,
        name: 'get_weather',
        description: 'Get the current weather',
        inputSchema: {
          type: 'object' as const,
          properties: {
            location: { type: 'string' as const },
          },
          required: ['location'],
        },
      };

      it('should send tool_choice auto', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [TEST_TOOL],
          toolChoice: { type: 'auto' },
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should send tool_choice none', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [TEST_TOOL],
          toolChoice: { type: 'none' },
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should send tool_choice required', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [TEST_TOOL],
          toolChoice: { type: 'required' },
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should send tool_choice with specific tool', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [TEST_TOOL],
          toolChoice: { type: 'tool', toolName: 'get_weather' },
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });

    describe('system messages', () => {
      it('should send instructions from system message', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should join multiple system messages with newlines', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'system',
              content: 'Always be concise.',
            },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });

    describe('multi-turn tool conversation', () => {
      it('should send correct request body with user, assistant tool-call, and tool result', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        const toolConversationPrompt: LanguageModelV4Prompt = [
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is the weather in Tokyo?' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_weather_123',
                toolName: 'get_weather',
                input: { location: 'Tokyo' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_weather_123',
                toolName: 'get_weather',
                output: {
                  type: 'json',
                  value: { temperature: 22, condition: 'sunny', humidity: 65 },
                },
              },
            ],
          },
        ];

        await createModel().doGenerate({
          prompt: toolConversationPrompt,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the current weather for a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });

    describe('pdf input file', () => {
      function getPdfPrompt(): LanguageModelV4Prompt {
        return [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What text does this PDF contain? Reply with just the text content, nothing else.',
              },
              {
                type: 'file',
                data: {
                  type: 'url',
                  url: new globalThis.URL(
                    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                  ),
                },
                mediaType: 'application/pdf',
              },
            ],
          },
        ];
      }

      let result: LanguageModelV4GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('openai-pdf-input-file.1');

        result = await createModel('gpt-4.1-nano').doGenerate({
          prompt: getPdfPrompt(),
        });
      });

      it('should send input_file in request body', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "What text does this PDF contain? Reply with just the text content, nothing else.",
                    "type": "input_text",
                  },
                  {
                    "file_url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                    "type": "input_file",
                  },
                ],
                "role": "user",
                "type": "message",
              },
            ],
            "model": "gpt-4.1-nano",
          }
        `);
      });

      it('should produce correct content', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "lmstudio": {
                  "itemId": "msg_048edf44633e41ae0069d4fea0d1a08194af1e491c093df1d9",
                },
              },
              "text": "Dummy PDF file",
              "type": "text",
            },
          ]
        `);
      });

      it('should extract usage correctly', async () => {
        expect(result.usage).toMatchInlineSnapshot(`
          {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": undefined,
              "noCache": 44,
              "total": 44,
            },
            "outputTokens": {
              "reasoning": 0,
              "text": 4,
              "total": 4,
            },
            "raw": {
              "input_tokens": 44,
              "input_tokens_details": {
                "cached_tokens": 0,
              },
              "output_tokens": 4,
              "output_tokens_details": {
                "reasoning_tokens": 0,
              },
              "total_tokens": 48,
            },
          }
        `);
      });
    });
  });

  describe('doStream', () => {
    function prepareChunksFixtureResponse(filename: string) {
      const chunks = fs
        .readFileSync(
          `src/responses/__fixtures__/${filename}.chunks.txt`,
          'utf8',
        )
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => `data: ${line}\n\n`);
      chunks.push('data: [DONE]\n\n');

      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks,
      };
    }

    describe('basic generation', () => {
      it('should stream content', async () => {
        prepareChunksFixtureResponse('lmstudio-basic.1');

        const result = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    it('should stream reasoning summary text deltas', async () => {
      prepareChunksFixtureResponse('openai-reasoning-summary-text.1');

      const result = await createModel().doStream({
        prompt: TEST_PROMPT,
      });

      const parts = await convertReadableStreamToArray(result.stream);

      expect(
        parts.filter(part => part.type.startsWith('reasoning')),
      ).toStrictEqual([
        {
          type: 'reasoning-start',
          id: 'rs_1',
        },
        {
          type: 'reasoning-delta',
          id: 'rs_1',
          delta: 'Think',
        },
        {
          type: 'reasoning-delta',
          id: 'rs_1',
          delta: 'ing.',
        },
        {
          type: 'reasoning-end',
          id: 'rs_1',
          providerMetadata: {
            lmstudio: {
              itemId: 'rs_1',
              reasoningSummary: [
                {
                  type: 'summary_text',
                  text: 'Thinking.',
                },
              ],
              reasoningContent: null,
            },
          },
        },
      ]);
    });

    it.each([
      {
        event: {
          type: 'response.failed',
          sequence_number: 1,
          response: {
            status: 'failed',
            error: {
              code: '429',
              message: 'Rate limit reached',
            },
          },
        },
        expectedType: 'response.failed',
        expectedMessage: 'Rate limit reached',
        expectedCode: '429',
      },
      {
        event: {
          type: 'error',
          sequence_number: 1,
          error: {
            code: '503',
            message: 'Service unavailable',
          },
        },
        expectedType: 'error',
        expectedMessage: 'Service unavailable',
        expectedCode: '503',
      },
    ])('preserves $expectedType stream errors', async testCase => {
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify(testCase.event)}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const result = await createModel().doStream({ prompt: TEST_PROMPT });
      const parts = await convertReadableStreamToArray(result.stream);
      const errorPart = parts.find(part => part.type === 'error');

      expect(errorPart?.type).toBe('error');
      if (errorPart?.type !== 'error') {
        expect.fail('Expected an error part');
      }
      expect(isProviderStreamError(errorPart.error)).toBe(true);
      expect(errorPart.error).toMatchObject({
        message: testCase.expectedMessage,
        type: testCase.expectedType,
        code: testCase.expectedCode,
        data: testCase.event,
      });
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'error' },
      });
    });

    it('should decode registered extension events and completed items', async () => {
      const receipt = {
        id: 'search_stream_1',
        type: 'acme:document_search_receipt',
        status: 'completed',
        call_id: 'call_stream_1',
        name: 'documentSearch',
        query: { text: 'streamed query' },
        result: { documents: ['doc_1'] },
        opaque_receipt: { cursor: 'cursor_1' },
      };
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify({
            type: 'acme:document_search_input',
            sequence_number: 0,
            call_id: 'call_stream_1',
            name: 'documentSearch',
            delta: '{"text":"streamed query"}',
          })}\n\n`,
          `data: ${JSON.stringify({
            type: 'response.output_item.done',
            sequence_number: 1,
            output_index: 0,
            item: receipt,
          })}\n\n`,
          `data: ${JSON.stringify({
            type: 'response.completed',
            sequence_number: 2,
            response: {
              id: 'response_stream_1',
              object: 'response',
              created_at: 0,
              status: 'completed',
              model: 'test-model',
              output: [receipt],
              usage: {
                input_tokens: 1,
                output_tokens: 1,
                total_tokens: 2,
              },
            },
          })}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const result = await createModel('gemma-7b-it', [
        createDocumentSearchExtension({ providerExecuted: true }),
      ]).doStream({
        prompt: TEST_PROMPT,
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts).toContainEqual({
        type: 'tool-input-start',
        id: 'call_stream_1',
        toolName: 'documentSearch',
        providerExecuted: true,
      });
      expect(parts).toContainEqual({
        type: 'tool-input-delta',
        id: 'call_stream_1',
        delta: '{"text":"streamed query"}',
      });
      expect(parts).toContainEqual({
        type: 'custom',
        kind: 'open-responses.extension-replay',
        providerMetadata: {
          lmstudio: {
            openResponsesExtension: {
              id: 'acme.document_search',
              item: receipt,
            },
          },
        },
      });
      expect(parts).toContainEqual({
        type: 'tool-call',
        toolCallId: 'call_stream_1',
        toolName: 'documentSearch',
        input: '{"text":"streamed query"}',
        providerExecuted: true,
        providerMetadata: {
          lmstudio: {
            openResponsesExtension: {
              id: 'acme.document_search',
              itemId: 'search_stream_1',
            },
          },
        },
      });
      expect(parts).toContainEqual({
        type: 'tool-result',
        toolCallId: 'call_stream_1',
        toolName: 'documentSearch',
        result: { documents: ['doc_1'] },
        providerMetadata: {
          lmstudio: {
            openResponsesExtension: {
              id: 'acme.document_search',
              itemId: 'search_stream_1',
            },
          },
        },
      });
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'tool-calls' },
      });
    });

    it('should preserve output text annotations in stream metadata', async () => {
      const annotation = {
        type: 'url_citation',
        start_index: 0,
        end_index: 7,
        url: 'https://example.com/source',
        title: 'Example source',
      };
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify({
            type: 'response.output_item.added',
            sequence_number: 0,
            output_index: 0,
            item: {
              id: 'msg_annotated',
              type: 'message',
              role: 'assistant',
              status: 'in_progress',
              content: [],
            },
          })}\n\n`,
          `data: ${JSON.stringify({
            type: 'response.output_text.delta',
            sequence_number: 1,
            item_id: 'msg_annotated',
            output_index: 0,
            content_index: 0,
            delta: 'Sourced answer',
          })}\n\n`,
          `data: ${JSON.stringify({
            type: 'response.output_item.done',
            sequence_number: 2,
            output_index: 0,
            item: {
              id: 'msg_annotated',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: 'Sourced answer',
                  annotations: [annotation],
                },
              ],
            },
          })}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const result = await createModel().doStream({
        prompt: TEST_PROMPT,
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts).toContainEqual({
        type: 'text-end',
        id: 'msg_annotated',
        providerMetadata: {
          lmstudio: {
            itemId: 'msg_annotated',
            annotations: [annotation],
          },
        },
      });
    });

    it('should send provider-native reasoning effort when streaming', async () => {
      prepareChunksFixtureResponse('lmstudio-basic.1');

      const result = await createModel().doStream({
        prompt: TEST_PROMPT,
        providerOptions: {
          lmstudio: {
            reasoningEffort: 'max',
          } satisfies OpenResponsesLanguageModelOptions,
        },
      });

      await convertReadableStreamToArray(result.stream);

      expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual({
        effort: 'max',
      });
    });

    describe('reasoning with tool call', () => {
      it('should stream reasoning and tool call content', async () => {
        prepareChunksFixtureResponse('lmstudio-tool-call.2');

        const result = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    it('should close unfinished reasoning items with their original ids', async () => {
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify({
            type: 'response.output_item.added',
            sequence_number: 0,
            output_index: 0,
            item: {
              id: 'rs_reasoning_item',
              type: 'reasoning',
              summary: [],
            },
          })}\n\n`,
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            sequence_number: 1,
            response: {
              status: 'incomplete',
              incomplete_details: { reason: 'max_output_tokens' },
              usage: {
                input_tokens: 1,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens: 1,
                output_tokens_details: { reasoning_tokens: 1 },
                total_tokens: 2,
              },
            },
          })}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const result = await createModel().doStream({
        prompt: TEST_PROMPT,
      });

      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts).toContainEqual({
        type: 'reasoning-start',
        id: 'rs_reasoning_item',
      });
      expect(parts).toContainEqual({
        type: 'reasoning-end',
        id: 'rs_reasoning_item',
      });
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: {
          unified: 'length',
          raw: 'max_output_tokens',
        },
      });
    });

    it('should not pollute Object.prototype from tool call item ids', async () => {
      const originalArgumentsDescriptor = Object.getOwnPropertyDescriptor(
        Object.prototype,
        'arguments',
      );

      try {
        server.urls[URL].response = {
          type: 'stream-chunks',
          chunks: [
            `data: ${JSON.stringify({
              type: 'response.function_call_arguments.done',
              item_id: '__proto__',
              output_index: 0,
              arguments: 'polluted',
              sequence_number: 0,
            })}\n\n`,
            `data: ${JSON.stringify({
              type: 'response.completed',
              response: {
                incomplete_details: null,
                status: 'completed',
                usage: {
                  input_tokens: 0,
                  input_tokens_details: { cached_tokens: 0 },
                  output_tokens: 0,
                  output_tokens_details: { reasoning_tokens: 0 },
                  total_tokens: 0,
                },
              },
              sequence_number: 1,
            })}\n\n`,
            'data: [DONE]\n\n',
          ],
        };

        const result = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        await convertReadableStreamToArray(result.stream);

        expect(
          Object.getOwnPropertyDescriptor(Object.prototype, 'arguments'),
        ).toStrictEqual(originalArgumentsDescriptor);
      } finally {
        if (originalArgumentsDescriptor == null) {
          delete (Object.prototype as { arguments?: unknown }).arguments;
        } else {
          Reflect.defineProperty(
            Object.prototype,
            'arguments',
            originalArgumentsDescriptor,
          );
        }
      }
    });

    describe('pdf input file', () => {
      it('should stream content from pdf input', async () => {
        prepareChunksFixtureResponse('openai-pdf-input-file.1');

        const result = await createModel('gpt-4.1-nano').doStream({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'What text does this PDF contain?',
                },
                {
                  type: 'file',
                  data: {
                    type: 'url',
                    url: new globalThis.URL(
                      'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                    ),
                  },
                  mediaType: 'application/pdf',
                },
              ],
            },
          ],
        });

        expect(await convertReadableStreamToArray(result.stream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "stream-start",
                "warnings": [],
              },
              {
                "id": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
                "type": "text-start",
              },
              {
                "delta": "Dummy",
                "id": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
                "type": "text-delta",
              },
              {
                "delta": " PDF",
                "id": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
                "type": "text-delta",
              },
              {
                "delta": " file",
                "id": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
                "type": "text-delta",
              },
              {
                "id": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
                "providerMetadata": {
                  "lmstudio": {
                    "itemId": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
                  },
                },
                "type": "text-end",
              },
              {
                "finishReason": {
                  "raw": undefined,
                  "unified": "stop",
                },
                "providerMetadata": undefined,
                "type": "finish",
                "usage": {
                  "inputTokens": {
                    "cacheRead": 0,
                    "cacheWrite": undefined,
                    "noCache": 44,
                    "total": 44,
                  },
                  "outputTokens": {
                    "reasoning": 0,
                    "text": 4,
                    "total": 4,
                  },
                  "raw": {
                    "input_tokens": 44,
                    "input_tokens_details": {
                      "cached_tokens": 0,
                    },
                    "output_tokens": 4,
                    "output_tokens_details": {
                      "reasoning_tokens": 0,
                    },
                    "total_tokens": 48,
                  },
                },
              },
            ]
          `);
      });
    });
  });
});
