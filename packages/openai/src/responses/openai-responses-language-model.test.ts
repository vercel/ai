import {
  LanguageModelV2FunctionTool,
  LanguageModelV2Prompt,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const TEST_TOOLS: Array<LanguageModelV2FunctionTool> = [
  {
    type: 'function',
    name: 'weather',
    parameters: {
      type: 'object',
      properties: { location: { type: 'string' } },
      required: ['location'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'cityAttractions',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    },
  },
];

function createModel(modelId: string) {
  return new OpenAIResponsesLanguageModel(modelId, {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: `Bearer APIKEY` }),
    generateId: mockId(),
  });
}

describe('OpenAIResponsesLanguageModel', () => {
  const server = createTestServer({
    'https://api.openai.com/v1/responses': {},
  });

  const prepareReasoningResponse = () => {
    server.urls['https://api.openai.com/v1/responses'].response = {
      type: 'json-value',
      body: {
        id: 'resp_67c97c0203188190a025beb4a75242bc',
        object: 'response',
        created_at: 1741257730,
        status: 'completed',
        error: null,
        incomplete_details: null,
        input: [],
        instructions: null,
        max_output_tokens: null,
        model: 'o3-mini-2025-01-31',
        output: [
          {
            id: 'rs_6808709f6fcc8191ad2e2fdd784017b3',
            type: 'reasoning',
            summary: [
              {
                type: 'summary_text',
                text: '**Exploring burrito origins**\n\nThe user is curious about the debate regarding Taqueria La Cumbre and El Farolito.',
              },
              {
                type: 'summary_text',
                text: "**Investigating burrito origins**\n\nThere's a fascinating debate about who created the Mission burrito.",
              },
            ],
          },
          {
            id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'answer text',
                annotations: [],
              },
            ],
          },
        ],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: {
          effort: 'low',
          summary: 'auto',
        },
        store: true,
        temperature: 1,
        text: {
          format: {
            type: 'text',
          },
        },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: {
          input_tokens: 34,
          input_tokens_details: {
            cached_tokens: 0,
          },
          output_tokens: 538,
          output_tokens_details: {
            reasoning_tokens: 320,
          },
          total_tokens: 572,
        },
        user: null,
        metadata: {},
      },
    };
  };

  describe('doGenerate', () => {
    describe('basic text response', () => {
      beforeEach(() => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_67c97c0203188190a025beb4a75242bc',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            incomplete_details: null,
            input: [],
            instructions: null,
            max_output_tokens: null,
            model: 'gpt-4o-2024-07-18',
            output: [
              {
                id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'answer text',
                    annotations: [],
                  },
                ],
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: {
              effort: null,
              summary: null,
            },
            store: true,
            temperature: 1,
            text: {
              format: {
                type: 'text',
              },
            },
            tool_choice: 'auto',
            tools: [],
            top_p: 1,
            truncation: 'disabled',
            usage: {
              input_tokens: 345,
              input_tokens_details: {
                cached_tokens: 234,
              },
              output_tokens: 538,
              output_tokens_details: {
                reasoning_tokens: 123,
              },
              total_tokens: 572,
            },
            user: null,
            metadata: {},
          },
        };
      });

      it('should generate text', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "answer text",
              "type": "text",
            },
          ]
        `);
      });

      it('should extract usage', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.usage).toMatchInlineSnapshot(`
          {
            "cachedInputTokens": 234,
            "inputTokens": 345,
            "outputTokens": 538,
            "reasoningTokens": 123,
            "totalTokens": 883,
          }
        `);
      });

      it('should extract response id metadata ', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.providerMetadata).toStrictEqual({
          openai: {
            responseId: 'resp_67c97c0203188190a025beb4a75242bc',
          },
        });
      });

      it('should send model id, settings, and input', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          temperature: 0.5,
          top_p: 0.3,
          input: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should remove unsupported settings for o1', async () => {
        const { warnings } = await createModel('o1-mini').doGenerate({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'o1-mini',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
        });

        expect(warnings).toStrictEqual([
          {
            type: 'other',
            message: 'system messages are removed for this model',
          },
          {
            details: 'temperature is not supported for reasoning models',
            setting: 'temperature',
            type: 'unsupported-setting',
          },
          {
            details: 'topP is not supported for reasoning models',
            setting: 'topP',
            type: 'unsupported-setting',
          },
        ]);
      });

      it('should remove unsupported settings for o3', async () => {
        const { warnings } = await createModel('o3').doGenerate({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'o3',
          input: [
            { role: 'developer', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
        });

        expect(warnings).toStrictEqual([
          {
            details: 'temperature is not supported for reasoning models',
            setting: 'temperature',
            type: 'unsupported-setting',
          },
          {
            details: 'topP is not supported for reasoning models',
            setting: 'topP',
            type: 'unsupported-setting',
          },
        ]);
      });

      it('should send response format json schema', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            name: 'response',
            description: 'A response',
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          text: {
            format: {
              type: 'json_schema',
              strict: true,
              name: 'response',
              description: 'A response',
              schema: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          },
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send response format json object', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          text: {
            format: {
              type: 'json_object',
            },
          },
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send parallelToolCalls provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              parallelToolCalls: false,
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          parallel_tool_calls: false,
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send store provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              store: false,
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          store: false,
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send user provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              store: false,
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          store: false,
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send previous response id provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              previousResponseId: 'resp_123',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          previous_response_id: 'resp_123',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send metadata provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              user: 'user_123',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          user: 'user_123',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send reasoningEffort provider option', async () => {
        const { warnings } = await createModel('o3').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'o3',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          reasoning: {
            effort: 'low',
          },
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send instructions provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              instructions: 'You are a friendly assistant.',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          instructions: 'You are a friendly assistant.',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send responseFormat json format', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          responseFormat: { type: 'json' },
          prompt: TEST_PROMPT,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          text: { format: { type: 'json_object' } },
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send responseFormat json_schema format', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          responseFormat: {
            type: 'json',
            name: 'response',
            description: 'A response',
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          prompt: TEST_PROMPT,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          text: {
            format: {
              type: 'json_schema',
              strict: true,
              name: 'response',
              description: 'A response',
              schema: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          },
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: 'Hello' }],
            },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send responseFormat json_schema format with strictSchemas false', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          responseFormat: {
            type: 'json',
            name: 'response',
            description: 'A response',
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              strictSchemas: false,
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          text: {
            format: {
              type: 'json_schema',
              strict: false,
              name: 'response',
              description: 'A response',
              schema: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          },
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: 'Hello' }],
            },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send web_search tool', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          tools: [
            {
              type: 'provider-defined',
              id: 'openai.web_search_preview',
              name: 'web_search_preview',
              args: {
                searchContextSize: 'high',
                userLocation: {
                  type: 'approximate',
                  city: 'San Francisco',
                },
              },
            },
          ],
          prompt: TEST_PROMPT,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          tools: [
            {
              type: 'web_search_preview',
              search_context_size: 'high',
              user_location: { type: 'approximate', city: 'San Francisco' },
            },
          ],
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send web_search tool as tool_choice', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          toolChoice: {
            type: 'tool',
            toolName: 'web_search_preview',
          },
          tools: [
            {
              type: 'provider-defined',
              id: 'openai.web_search_preview',
              name: 'web_search_preview',
              args: {
                searchContextSize: 'high',
                userLocation: {
                  type: 'approximate',
                  city: 'San Francisco',
                },
              },
            },
          ],
          prompt: TEST_PROMPT,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          tool_choice: { type: 'web_search_preview' },
          tools: [
            {
              type: 'web_search_preview',
              search_context_size: 'high',
              user_location: { type: 'approximate', city: 'San Francisco' },
            },
          ],
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should warn about unsupported settings', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          stopSequences: ['\n\n'],
          topK: 0.1,
          presencePenalty: 0,
          frequencyPenalty: 0,
          seed: 42,
        });

        expect(warnings).toStrictEqual([
          { type: 'unsupported-setting', setting: 'topK' },
          { type: 'unsupported-setting', setting: 'seed' },
          { type: 'unsupported-setting', setting: 'presencePenalty' },
          { type: 'unsupported-setting', setting: 'frequencyPenalty' },
          { type: 'unsupported-setting', setting: 'stopSequences' },
        ]);
      });

      it('should extract reasoning summary', async () => {
        prepareReasoningResponse();

        const result = await createModel('o3-mini').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
              reasoningSummary: 'auto',
            },
          },
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "**Exploring burrito origins**

          The user is curious about the debate regarding Taqueria La Cumbre and El Farolito.,**Investigating burrito origins**

          There's a fascinating debate about who created the Mission burrito.",
              "type": "reasoning",
            },
            {
              "text": "answer text",
              "type": "text",
            },
          ]
        `);

        expect(result.usage).toMatchInlineSnapshot(`
          {
            "cachedInputTokens": 0,
            "inputTokens": 34,
            "outputTokens": 538,
            "reasoningTokens": 320,
            "totalTokens": 572,
          }
        `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'low',
            summary: 'auto',
          },
        });
      });
    });

    describe('tool calls', () => {
      beforeEach(() => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_67c97c0203188190a025beb4a75242bc',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            incomplete_details: null,
            input: [],
            instructions: null,
            max_output_tokens: null,
            model: 'gpt-4o-2024-07-18',
            output: [
              {
                type: 'function_call',
                id: 'fc_67caf7f4c1ec8190b27edfb5580cfd31',
                call_id: 'call_0NdsJqOS8N3J9l2p0p4WpYU9',
                name: 'weather',
                arguments: '{"location":"San Francisco"}',
                status: 'completed',
              },
              {
                type: 'function_call',
                id: 'fc_67caf7f5071c81908209c2909c77af05',
                call_id: 'call_gexo0HtjUfmAIW4gjNOgyrcr',
                name: 'cityAttractions',
                arguments: '{"city":"San Francisco"}',
                status: 'completed',
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: {
              effort: null,
              summary: null,
            },
            store: true,
            temperature: 1,
            text: {
              format: {
                type: 'text',
              },
            },
            tool_choice: 'auto',
            tools: [
              {
                type: 'function',
                description: 'Get the weather in a location',
                name: 'weather',
                parameters: {
                  type: 'object',
                  properties: {
                    location: {
                      type: 'string',
                      description: 'The location to get the weather for',
                    },
                  },
                  required: ['location'],
                  additionalProperties: false,
                },
                strict: true,
              },
              {
                type: 'function',
                description: null,
                name: 'cityAttractions',
                parameters: {
                  type: 'object',
                  properties: {
                    city: {
                      type: 'string',
                    },
                  },
                  required: ['city'],
                  additionalProperties: false,
                },
                strict: true,
              },
            ],
            top_p: 1,
            truncation: 'disabled',
            usage: {
              input_tokens: 34,
              output_tokens: 538,
              output_tokens_details: {
                reasoning_tokens: 0,
              },
              total_tokens: 572,
            },
            user: null,
            metadata: {},
          },
        };
      });

      it('should generate tool calls', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          tools: TEST_TOOLS,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "args": "{"location":"San Francisco"}",
              "toolCallId": "call_0NdsJqOS8N3J9l2p0p4WpYU9",
              "toolCallType": "function",
              "toolName": "weather",
              "type": "tool-call",
            },
            {
              "args": "{"city":"San Francisco"}",
              "toolCallId": "call_gexo0HtjUfmAIW4gjNOgyrcr",
              "toolCallType": "function",
              "toolName": "cityAttractions",
              "type": "tool-call",
            },
          ]
        `);
      });

      it('should have tool-calls finish reason', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          tools: TEST_TOOLS,
        });

        expect(result.finishReason).toStrictEqual('tool-calls');
      });
    });

    describe('web search', () => {
      const outputText = `Last week in San Francisco, several notable events and developments took place:\n\n**Bruce Lee Statue in Chinatown**\n\nThe Chinese Historical Society of America Museum announced plans to install a Bruce Lee statue in Chinatown. This initiative, supported by the Rose Pak Community Fund, the Bruce Lee Foundation, and Stand With Asians, aims to honor Lee's contributions to film and martial arts. Artist Arnie Kim has been commissioned for the project, with a fundraising goal of $150,000. ([axios.com](https://www.axios.com/local/san-francisco/2025/03/07/bruce-lee-statue-sf-chinatown?utm_source=chatgpt.com))\n\n**Office Leasing Revival**\n\nThe Bay Area experienced a resurgence in office leasing, securing 11 of the largest U.S. office leases in 2024. This trend, driven by the tech industry's growth and advancements in generative AI, suggests a potential boost to downtown recovery through increased foot traffic. ([axios.com](https://www.axios.com/local/san-francisco/2025/03/03/bay-area-office-leasing-activity?utm_source=chatgpt.com))\n\n**Spring Blooms in the Bay Area**\n\nWith the arrival of spring, several locations in the Bay Area are showcasing vibrant blooms. Notable spots include the Conservatory of Flowers, Japanese Tea Garden, Queen Wilhelmina Tulip Garden, and the San Francisco Botanical Garden, each offering unique floral displays. ([axios.com](https://www.axios.com/local/san-francisco/2025/03/03/where-to-see-spring-blooms-bay-area?utm_source=chatgpt.com))\n\n**Oceanfront Great Highway Park**\n\nSan Francisco's long-awaited Oceanfront Great Highway park is set to open on April 12. This 43-acre, car-free park will span a two-mile stretch of the Great Highway from Lincoln Way to Sloat Boulevard, marking the largest pedestrianization project in California's history. The park follows voter approval of Proposition K, which permanently bans cars on part of the highway. ([axios.com](https://www.axios.com/local/san-francisco/2025/03/03/great-highway-park-opening-april-recall-campaign?utm_source=chatgpt.com))\n\n**Warmer Spring Seasons**\n\nAn analysis by Climate Central revealed that San Francisco, along with most U.S. cities, is experiencing increasingly warmer spring seasons. Over a 55-year period from 1970 to 2024, the national average temperature during March through May rose by 2.4°F. This warming trend poses various risks, including early snowmelt and increased wildfire threats. ([axios.com](https://www.axios.com/local/san-francisco/2025/03/03/climate-weather-spring-temperatures-warmer-sf?utm_source=chatgpt.com))\n\n\n# Key San Francisco Developments Last Week:\n- [Bruce Lee statue to be installed in SF Chinatown](https://www.axios.com/local/san-francisco/2025/03/07/bruce-lee-statue-sf-chinatown?utm_source=chatgpt.com)\n- [The Bay Area is set to make an office leasing comeback](https://www.axios.com/local/san-francisco/2025/03/03/bay-area-office-leasing-activity?utm_source=chatgpt.com)\n- [Oceanfront Great Highway park set to open in April](https://www.axios.com/local/san-francisco/2025/03/03/great-highway-park-opening-april-recall-campaign?utm_source=chatgpt.com)`;

      beforeEach(() => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_67cf2b2f6bd081909be2c8054ddef0eb',
            object: 'response',
            created_at: 1741630255,
            status: 'completed',
            error: null,
            incomplete_details: null,
            instructions: null,
            max_output_tokens: null,
            model: 'gpt-4o-2024-07-18',
            output: [
              {
                type: 'web_search_call',
                id: 'ws_67cf2b3051e88190b006770db6fdb13d',
                status: 'completed',
              },
              {
                type: 'message',
                id: 'msg_67cf2b35467481908f24412e4fd40d66',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: outputText,
                    annotations: [
                      {
                        type: 'url_citation',
                        start_index: 486,
                        end_index: 606,
                        url: 'https://www.axios.com/local/san-francisco/2025/03/07/bruce-lee-statue-sf-chinatown?utm_source=chatgpt.com',
                        title:
                          'Bruce Lee statue to be installed in SF Chinatown',
                      },
                      {
                        type: 'url_citation',
                        start_index: 912,
                        end_index: 1035,
                        url: 'https://www.axios.com/local/san-francisco/2025/03/03/bay-area-office-leasing-activity?utm_source=chatgpt.com',
                        title:
                          'The Bay Area is set to make an office leasing comeback',
                      },
                      {
                        type: 'url_citation',
                        start_index: 1346,
                        end_index: 1472,
                        url: 'https://www.axios.com/local/san-francisco/2025/03/03/where-to-see-spring-blooms-bay-area?utm_source=chatgpt.com',
                        title: 'Where to see spring blooms in the Bay Area',
                      },
                      {
                        type: 'url_citation',
                        start_index: 1884,
                        end_index: 2023,
                        url: 'https://www.axios.com/local/san-francisco/2025/03/03/great-highway-park-opening-april-recall-campaign?utm_source=chatgpt.com',
                        title:
                          'Oceanfront Great Highway park set to open in April',
                      },
                      {
                        type: 'url_citation',
                        start_index: 2404,
                        end_index: 2540,
                        url: 'https://www.axios.com/local/san-francisco/2025/03/03/climate-weather-spring-temperatures-warmer-sf?utm_source=chatgpt.com',
                        title:
                          "San Francisco's spring seasons are getting warmer",
                      },
                    ],
                  },
                ],
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: {
              effort: null,
              summary: null,
            },
            store: true,
            temperature: 0,
            text: {
              format: {
                type: 'text',
              },
            },
            tool_choice: 'auto',
            tools: [
              {
                type: 'web_search_preview',
                search_context_size: 'medium',
                user_location: {
                  type: 'approximate',
                  city: null,
                  country: 'US',
                  region: null,
                  timezone: null,
                },
              },
            ],
            top_p: 1,
            truncation: 'disabled',
            usage: {
              input_tokens: 327,
              input_tokens_details: {
                cached_tokens: 0,
              },
              output_tokens: 770,
              output_tokens_details: {
                reasoning_tokens: 0,
              },
              total_tokens: 1097,
            },
            user: null,
            metadata: {},
          },
        };
      });

      it('should generate text and sources', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "Last week in San Francisco, several notable events and developments took place:

          **Bruce Lee Statue in Chinatown**

          The Chinese Historical Society of America Museum announced plans to install a Bruce Lee statue in Chinatown. This initiative, supported by the Rose Pak Community Fund, the Bruce Lee Foundation, and Stand With Asians, aims to honor Lee's contributions to film and martial arts. Artist Arnie Kim has been commissioned for the project, with a fundraising goal of $150,000. ([axios.com](https://www.axios.com/local/san-francisco/2025/03/07/bruce-lee-statue-sf-chinatown?utm_source=chatgpt.com))

          **Office Leasing Revival**

          The Bay Area experienced a resurgence in office leasing, securing 11 of the largest U.S. office leases in 2024. This trend, driven by the tech industry's growth and advancements in generative AI, suggests a potential boost to downtown recovery through increased foot traffic. ([axios.com](https://www.axios.com/local/san-francisco/2025/03/03/bay-area-office-leasing-activity?utm_source=chatgpt.com))

          **Spring Blooms in the Bay Area**

          With the arrival of spring, several locations in the Bay Area are showcasing vibrant blooms. Notable spots include the Conservatory of Flowers, Japanese Tea Garden, Queen Wilhelmina Tulip Garden, and the San Francisco Botanical Garden, each offering unique floral displays. ([axios.com](https://www.axios.com/local/san-francisco/2025/03/03/where-to-see-spring-blooms-bay-area?utm_source=chatgpt.com))

          **Oceanfront Great Highway Park**

          San Francisco's long-awaited Oceanfront Great Highway park is set to open on April 12. This 43-acre, car-free park will span a two-mile stretch of the Great Highway from Lincoln Way to Sloat Boulevard, marking the largest pedestrianization project in California's history. The park follows voter approval of Proposition K, which permanently bans cars on part of the highway. ([axios.com](https://www.axios.com/local/san-francisco/2025/03/03/great-highway-park-opening-april-recall-campaign?utm_source=chatgpt.com))

          **Warmer Spring Seasons**

          An analysis by Climate Central revealed that San Francisco, along with most U.S. cities, is experiencing increasingly warmer spring seasons. Over a 55-year period from 1970 to 2024, the national average temperature during March through May rose by 2.4°F. This warming trend poses various risks, including early snowmelt and increased wildfire threats. ([axios.com](https://www.axios.com/local/san-francisco/2025/03/03/climate-weather-spring-temperatures-warmer-sf?utm_source=chatgpt.com))


          # Key San Francisco Developments Last Week:
          - [Bruce Lee statue to be installed in SF Chinatown](https://www.axios.com/local/san-francisco/2025/03/07/bruce-lee-statue-sf-chinatown?utm_source=chatgpt.com)
          - [The Bay Area is set to make an office leasing comeback](https://www.axios.com/local/san-francisco/2025/03/03/bay-area-office-leasing-activity?utm_source=chatgpt.com)
          - [Oceanfront Great Highway park set to open in April](https://www.axios.com/local/san-francisco/2025/03/03/great-highway-park-opening-april-recall-campaign?utm_source=chatgpt.com)",
              "type": "text",
            },
            {
              "id": "id-0",
              "sourceType": "url",
              "title": "Bruce Lee statue to be installed in SF Chinatown",
              "type": "source",
              "url": "https://www.axios.com/local/san-francisco/2025/03/07/bruce-lee-statue-sf-chinatown?utm_source=chatgpt.com",
            },
            {
              "id": "id-1",
              "sourceType": "url",
              "title": "The Bay Area is set to make an office leasing comeback",
              "type": "source",
              "url": "https://www.axios.com/local/san-francisco/2025/03/03/bay-area-office-leasing-activity?utm_source=chatgpt.com",
            },
            {
              "id": "id-2",
              "sourceType": "url",
              "title": "Where to see spring blooms in the Bay Area",
              "type": "source",
              "url": "https://www.axios.com/local/san-francisco/2025/03/03/where-to-see-spring-blooms-bay-area?utm_source=chatgpt.com",
            },
            {
              "id": "id-3",
              "sourceType": "url",
              "title": "Oceanfront Great Highway park set to open in April",
              "type": "source",
              "url": "https://www.axios.com/local/san-francisco/2025/03/03/great-highway-park-opening-april-recall-campaign?utm_source=chatgpt.com",
            },
            {
              "id": "id-4",
              "sourceType": "url",
              "title": "San Francisco's spring seasons are getting warmer",
              "type": "source",
              "url": "https://www.axios.com/local/san-francisco/2025/03/03/climate-weather-spring-temperatures-warmer-sf?utm_source=chatgpt.com",
            },
          ]
        `);
      });
    });
  });

  describe('doStream', () => {
    it('should stream text deltas', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.in_progress","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"msg_67c9a81dea8c8190b79651a2b3adf91e","type":"message","status":"in_progress","role":"assistant","content":[]}}\n\n`,
          `data:{"type":"response.content_part.added","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"delta":"Hello,"}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"delta":" World!"}\n\n`,
          `data:{"type":"response.output_text.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"text":"Hello, World!"}\n\n`,
          `data:{"type":"response.content_part.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"part":{"type":"output_text","text":"Hello, World!","annotations":[]}}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Hello, World!","annotations":[]}]}}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_67c9a878139c8190aa2e3105411b408b","object":"response","created_at":1741269112,"status":"completed","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[{"id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Hello, World!","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":{"input_tokens":543,"input_tokens_details":{"cached_tokens":234},"output_tokens":478,"output_tokens_details":{"reasoning_tokens":123},"total_tokens":512},"user":null,"metadata":{}}}\n\n`,
        ],
      };

      const { stream } = await createModel('gpt-4o').doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_67c9a81b6a048190a9ee441c5755a4e8",
            "modelId": "gpt-4o-2024-07-18",
            "timestamp": 2025-03-06T13:50:19.000Z,
            "type": "response-metadata",
          },
          {
            "text": "Hello,",
            "type": "text",
          },
          {
            "text": " World!",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "openai": {
                "responseId": "resp_67c9a81b6a048190a9ee441c5755a4e8",
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 234,
              "inputTokens": 543,
              "outputTokens": 478,
              "reasoningTokens": 123,
              "totalTokens": 1021,
            },
          },
        ]
      `);
    });

    it('should send finish reason for incomplete response', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.in_progress","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"msg_67c9a81dea8c8190b79651a2b3adf91e","type":"message","status":"in_progress","role":"assistant","content":[]}}\n\n`,
          `data:{"type":"response.content_part.added","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"delta":"Hello,"}\n\n`,
          `data:{"type":"response.output_text.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"text":"Hello,!"}\n\n`,
          `data:{"type":"response.content_part.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"part":{"type":"output_text","text":"Hello,","annotations":[]}}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","type":"message","status":"incomplete","role":"assistant","content":[{"type":"output_text","text":"Hello,","annotations":[]}]}}\n\n`,
          `data:{"type":"response.incomplete","response":{"id":"resp_67cadb40a0708190ac2763c0b6960f6f","object":"response","created_at":1741347648,"status":"incomplete","error":null,"incomplete_details":{"reason":"max_output_tokens"},"instructions":null,"max_output_tokens":100,"model":"gpt-4o-2024-07-18","output":[{"type":"message","id":"msg_67cadb410ccc81909fe1d8f427b9cf02","status":"incomplete","role":"assistant","content":[{"type":"output_text","text":"Hello,","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":{"input_tokens":0,"input_tokens_details":{"cached_tokens":0},"output_tokens":0,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":0},"user":null,"metadata":{}}}\n\n`,
        ],
      };

      const { stream } = await createModel('gpt-4o').doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_67c9a81b6a048190a9ee441c5755a4e8",
            "modelId": "gpt-4o-2024-07-18",
            "timestamp": 2025-03-06T13:50:19.000Z,
            "type": "response-metadata",
          },
          {
            "text": "Hello,",
            "type": "text",
          },
          {
            "finishReason": "length",
            "providerMetadata": {
              "openai": {
                "responseId": "resp_67c9a81b6a048190a9ee441c5755a4e8",
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 0,
              "inputTokens": 0,
              "outputTokens": 0,
              "reasoningTokens": 0,
              "totalTokens": 0,
            },
          },
        ]
      `);
    });

    it('should send streaming tool calls', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_67cb13a755c08190acbe3839a49632fc","object":"response","created_at":1741362087,"status":"in_progress","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"function","description":"Get the current location.","name":"currentLocation","parameters":{"type":"object","properties":{},"additionalProperties":false},"strict":true},{"type":"function","description":"Get the weather in a location","name":"weather","parameters":{"type":"object","properties":{"location":{"type":"string","description":"The location to get the weather for"}},"required":["location"],"additionalProperties":false},"strict":true}],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.in_progress","response":{"id":"resp_67cb13a755c08190acbe3839a49632fc","object":"response","created_at":1741362087,"status":"in_progress","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"function","description":"Get the current location.","name":"currentLocation","parameters":{"type":"object","properties":{},"additionalProperties":false},"strict":true},{"type":"function","description":"Get the weather in a location","name":"weather","parameters":{"type":"object","properties":{"location":{"type":"string","description":"The location to get the weather for"}},"required":["location"],"additionalProperties":false},"strict":true}],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_67cb13a838088190be08eb3927c87501","call_id":"call_6KxSghkb4MVnunFH2TxPErLP","name":"currentLocation","arguments":"","status":"completed"}}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a838088190be08eb3927c87501","output_index":0,"delta":"{}"}\n\n`,
          `data:{"type":"response.function_call_arguments.done","item_id":"fc_67cb13a838088190be08eb3927c87501","output_index":0,"arguments":"{}"}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","id":"fc_67cb13a838088190be08eb3927c87501","call_id":"call_pgjcAI4ZegMkP6bsAV7sfrJA","name":"currentLocation","arguments":"{}","status":"completed"}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_67cb13a858f081908a600343fa040f47","call_id":"call_Dg6WUmFHNeR5JxX1s53s1G4b","name":"weather","arguments":"","status":"in_progress"}}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"delta":"{"}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"delta":"\\"location"}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"delta":"\\":"}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"delta":"\\"Rome"}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"delta":"\\"}"}\n\n`,
          `data:{"type":"response.function_call_arguments.done","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"arguments":"{\\"location\\":\\"Rome\\"}"}\n\n`,
          `data:{"type":"response.output_item.done","output_index":1,"item":{"type":"function_call","id":"fc_67cb13a858f081908a600343fa040f47","call_id":"call_X2PAkDJInno9VVnNkDrfhboW","name":"weather","arguments":"{\\"location\\":\\"Rome\\"}","status":"completed"}}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_67cb13a755c08190acbe3839a49632fc","object":"response","created_at":1741362087,"status":"completed","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[{"type":"function_call","id":"fc_67cb13a838088190be08eb3927c87501","call_id":"call_KsVqaVAf3alAtCCkQe4itE7W","name":"currentLocation","arguments":"{}","status":"completed"},{"type":"function_call","id":"fc_67cb13a858f081908a600343fa040f47","call_id":"call_X2PAkDJInno9VVnNkDrfhboW","name":"weather","arguments":"{\\"location\\":\\"Rome\\"}","status":"completed"}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"function","description":"Get the current location.","name":"currentLocation","parameters":{"type":"object","properties":{},"additionalProperties":false},"strict":true},{"type":"function","description":"Get the weather in a location","name":"weather","parameters":{"type":"object","properties":{"location":{"type":"string","description":"The location to get the weather for"}},"required":["location"],"additionalProperties":false},"strict":true}],"top_p":1,"truncation":"disabled","usage":{"input_tokens":0,"input_tokens_details":{"cached_tokens":0},"output_tokens":0,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":0},"user":null,"metadata":{}}}\n\n`,
        ],
      };

      const { stream } = await createModel('gpt-4o').doStream({
        tools: TEST_TOOLS,
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_67cb13a755c08190acbe3839a49632fc",
            "modelId": "gpt-4o-2024-07-18",
            "timestamp": 2025-03-07T15:41:27.000Z,
            "type": "response-metadata",
          },
          {
            "argsTextDelta": "",
            "toolCallId": "call_6KxSghkb4MVnunFH2TxPErLP",
            "toolCallType": "function",
            "toolName": "currentLocation",
            "type": "tool-call-delta",
          },
          {
            "argsTextDelta": "{}",
            "toolCallId": "call_6KxSghkb4MVnunFH2TxPErLP",
            "toolCallType": "function",
            "toolName": "currentLocation",
            "type": "tool-call-delta",
          },
          {
            "args": "{}",
            "toolCallId": "call_pgjcAI4ZegMkP6bsAV7sfrJA",
            "toolCallType": "function",
            "toolName": "currentLocation",
            "type": "tool-call",
          },
          {
            "argsTextDelta": "",
            "toolCallId": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "toolCallType": "function",
            "toolName": "weather",
            "type": "tool-call-delta",
          },
          {
            "argsTextDelta": "{",
            "toolCallId": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "toolCallType": "function",
            "toolName": "weather",
            "type": "tool-call-delta",
          },
          {
            "argsTextDelta": ""location",
            "toolCallId": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "toolCallType": "function",
            "toolName": "weather",
            "type": "tool-call-delta",
          },
          {
            "argsTextDelta": "":",
            "toolCallId": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "toolCallType": "function",
            "toolName": "weather",
            "type": "tool-call-delta",
          },
          {
            "argsTextDelta": ""Rome",
            "toolCallId": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "toolCallType": "function",
            "toolName": "weather",
            "type": "tool-call-delta",
          },
          {
            "argsTextDelta": ""}",
            "toolCallId": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "toolCallType": "function",
            "toolName": "weather",
            "type": "tool-call-delta",
          },
          {
            "args": "{"location":"Rome"}",
            "toolCallId": "call_X2PAkDJInno9VVnNkDrfhboW",
            "toolCallType": "function",
            "toolName": "weather",
            "type": "tool-call",
          },
          {
            "finishReason": "tool-calls",
            "providerMetadata": {
              "openai": {
                "responseId": "resp_67cb13a755c08190acbe3839a49632fc",
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 0,
              "inputTokens": 0,
              "outputTokens": 0,
              "reasoningTokens": 0,
              "totalTokens": 0,
            },
          },
        ]
      `);
    });

    it('should stream sources', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_67cf3390786881908b27489d7e8cfb6b","object":"response","created_at":1741632400,"status":"in_progress","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-4o-mini-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"web_search_preview","search_context_size":"medium","user_location":{"type":"approximate","city":null,"country":"US","region":null,"timezone":null}}],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.in_progress","response":{"id":"resp_67cf3390786881908b27489d7e8cfb6b","object":"response","created_at":1741632400,"status":"in_progress","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-4o-mini-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"web_search_preview","search_context_size":"medium","user_location":{"type":"approximate","city":null,"country":"US","region":null,"timezone":null}}],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":0,"item":{"type":"web_search_call","id":"ws_67cf3390e9608190869b5d45698a7067","status":"in_progress"}}\n\n`,
          `data:{"type":"response.web_search_call.in_progress","output_index":0,"item_id":"ws_67cf3390e9608190869b5d45698a7067"}\n\n`,
          `data:{"type":"response.web_search_call.searching","output_index":0,"item_id":"ws_67cf3390e9608190869b5d45698a7067"}\n\n`,
          `data:{"type":"response.web_search_call.completed","output_index":0,"item_id":"ws_67cf3390e9608190869b5d45698a7067"}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"type":"web_search_call","id":"ws_67cf3390e9608190869b5d45698a7067","status":"completed"}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":1,"item":{"type":"message","id":"msg_67cf33924ea88190b8c12bf68c1f6416","status":"in_progress","role":"assistant","content":[]}}\n\n`,
          `data:{"type":"response.content_part.added","item_id":"msg_67cf33924ea88190b8c12bf68c1f6416","output_index":1,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67cf33924ea88190b8c12bf68c1f6416","output_index":1,"content_index":0,"delta":"Last week"}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67cf33924ea88190b8c12bf68c1f6416","output_index":1,"content_index":0,"delta":" in San Francisco"}\n\n`,
          `data:{"type":"response.output_text.annotation.added","item_id":"msg_67cf33924ea88190b8c12bf68c1f6416","output_index":1,"content_index":0,"annotation_index":0,"annotation":{"type":"url_citation","start_index":383,"end_index":493,"url":"https://www.sftourismtips.com/san-francisco-events-in-march.html?utm_source=chatgpt.com","title":"San Francisco Events in March 2025: Festivals, Theater & Easter"}}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67cf33924ea88190b8c12bf68c1f6416","output_index":1,"content_index":0,"delta":" a themed party"}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67cf33924ea88190b8c12bf68c1f6416","output_index":1,"content_index":0,"delta":"([axios.com](https://www.axios.com/local/san-francisco/2025/03/06/sf-events-march-what-to-do-giants-fanfest?utm_source=chatgpt.com))"}\n\n`,
          `data:{"type":"response.output_text.annotation.added","item_id":"msg_67cf33924ea88190b8c12bf68c1f6416","output_index":1,"content_index":0,"annotation_index":1,"annotation":{"type":"url_citation","start_index":630,"end_index":762,"url":"https://www.axios.com/local/san-francisco/2025/03/06/sf-events-march-what-to-do-giants-fanfest?utm_source=chatgpt.com","title":"SF weekend events: Giants FanFest, crab crawl and more"}}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67cf33924ea88190b8c12bf68c1f6416","output_index":1,"content_index":0,"delta":"."}\n\n`,
          `data:{"type":"response.output_text.done","item_id":"msg_67cf33924ea88190b8c12bf68c1f6416","output_index":1,"content_index":0,"text":"Last week in San Francisco a themed..."}\n\n`,
          `data:{"type":"response.content_part.done","item_id":"msg_67cf33924ea88190b8c12bf68c1f6416","output_index":1,"content_index":0,"part":{"type":"output_text","text":"Last week in San Francisco a themed party...","annotations":[{"type":"url_citation","start_index":383,"end_index":493,"url":"https://www.sftourismtips.com/san-francisco-events-in-march.html?utm_source=chatgpt.com","title":"San Francisco Events in March 2025: Festivals, Theater & Easter"},{"type":"url_citation","start_index":630,"end_index":762,"url":"https://www.axios.com/local/san-francisco/2025/03/06/sf-events-march-what-to-do-giants-fanfest?utm_source=chatgpt.com","title":"SF weekend events: Giants FanFest, crab crawl and more"}]}}\n\n`,
          `data:{"type":"response.output_item.done","output_index":1,"item":{"type":"message","id":"msg_67cf33924ea88190b8c12bf68c1f6416","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Last week in San Francisco a themed party...","annotations":[{"type":"url_citation","start_index":383,"end_index":493,"url":"https://www.sftourismtips.com/san-francisco-events-in-march.html?utm_source=chatgpt.com","title":"San Francisco Events in March 2025: Festivals, Theater & Easter"},{"type":"url_citation","start_index":630,"end_index":762,"url":"https://www.axios.com/local/san-francisco/2025/03/06/sf-events-march-what-to-do-giants-fanfest?utm_source=chatgpt.com","title":"SF weekend events: Giants FanFest, crab crawl and more"}]}]}}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_67cf3390786881908b27489d7e8cfb6b","object":"response","created_at":1741632400,"status":"completed","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-4o-mini-2024-07-18","output":[{"type":"web_search_call","id":"ws_67cf3390e9608190869b5d45698a7067","status":"completed"},{"type":"message","id":"msg_67cf33924ea88190b8c12bf68c1f6416","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Last week in San Francisco a themed party...","annotations":[{"type":"url_citation","start_index":383,"end_index":493,"url":"https://www.sftourismtips.com/san-francisco-events-in-march.html?utm_source=chatgpt.com","title":"San Francisco Events in March 2025: Festivals, Theater & Easter"},{"type":"url_citation","start_index":630,"end_index":762,"url":"https://www.axios.com/local/san-francisco/2025/03/06/sf-events-march-what-to-do-giants-fanfest?utm_source=chatgpt.com","title":"SF weekend events: Giants FanFest, crab crawl and more"}]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"web_search_preview","search_context_size":"medium","user_location":{"type":"approximate","city":null,"country":"US","region":null,"timezone":null}}],"top_p":1,"truncation":"disabled","usage":{"input_tokens":327,"input_tokens_details":{"cached_tokens":0},"output_tokens":834,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":1161},"user":null,"metadata":{}}}\n\n`,
        ],
      };

      const { stream } = await createModel('gpt-4o-mini').doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_67cf3390786881908b27489d7e8cfb6b",
            "modelId": "gpt-4o-mini-2024-07-18",
            "timestamp": 2025-03-10T18:46:40.000Z,
            "type": "response-metadata",
          },
          {
            "text": "Last week",
            "type": "text",
          },
          {
            "text": " in San Francisco",
            "type": "text",
          },
          {
            "id": "id-0",
            "sourceType": "url",
            "title": "San Francisco Events in March 2025: Festivals, Theater & Easter",
            "type": "source",
            "url": "https://www.sftourismtips.com/san-francisco-events-in-march.html?utm_source=chatgpt.com",
          },
          {
            "text": " a themed party",
            "type": "text",
          },
          {
            "text": "([axios.com](https://www.axios.com/local/san-francisco/2025/03/06/sf-events-march-what-to-do-giants-fanfest?utm_source=chatgpt.com))",
            "type": "text",
          },
          {
            "id": "id-1",
            "sourceType": "url",
            "title": "SF weekend events: Giants FanFest, crab crawl and more",
            "type": "source",
            "url": "https://www.axios.com/local/san-francisco/2025/03/06/sf-events-march-what-to-do-giants-fanfest?utm_source=chatgpt.com",
          },
          {
            "text": ".",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "openai": {
                "responseId": "resp_67cf3390786881908b27489d7e8cfb6b",
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 0,
              "inputTokens": 327,
              "outputTokens": 834,
              "reasoningTokens": 0,
              "totalTokens": 1161,
            },
          },
        ]
      `);
    });

    it('should stream reasoning summary', async () => {
      prepareReasoningResponse();

      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"low","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_68082c0556348191af675cee0453109b","output_index":0,"summary_index":0,"delta":"**Exploring burrito origins**\\n\\nThe user is"}\n\n`,
          `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_68082c0556348191af675cee0453109b","output_index":0,"summary_index":0,"delta":" curious about the debate regarding Taqueria La Cumbre and El Farolito."}\n\n`,
          `data:{"type":"response.reasoning_summary_text.done","item_id":"rs_68082c0556348191af675cee0453109b","output_index":0,"summary_index":0,"text":"**Exploring burrito origins**\\n\\nThe user is curious about the debate regarding Taqueria La Cumbre and El Farolito."}\n\n`,
          `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_68082c0556348191af675cee0453109b","output_index":0,"summary_index":1,"delta":"**Investigating burrito origins**\\n\\nThere's a fascinating debate about who created the Mission burrito."}\n\n`,
          `data:{"type":"response.reasoning_summary_part.done","item_id":"rs_68082c0556348191af675cee0453109b","output_index":0,"summary_index":1,"part":{"type":"summary_text","text":"**Investigating burrito origins**\\n\\nThere's a fascinating debate about who created the Mission burrito."}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":1,"item":{"id":"msg_67c9a81dea8c8190b79651a2b3adf91e","type":"message","status":"in_progress","role":"assistant","content":[]}}\n\n`,
          `data:{"type":"response.content_part.added","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":1,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":1,"content_index":0,"delta":"Taqueria La Cumbre"}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"completed","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[{"id":"rs_68082c0556348191af675cee0453109b","type":"reasoning","summary":[{"type":"summary_text","text":"**Exploring burrito origins**\\n\\nThe user is curious about the debate regarding Taqueria La Cumbre and El Farolito."},{"type":"summary_text","text":"**Investigating burrito origins**\\n\\nThere's a fascinating debate about who created the Mission burrito."}]},{"id":"msg_67c9a81dea8c8190b79651a2b3adf91e","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Taqueria La Cumbre","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"low","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":{"input_tokens":543,"input_tokens_details":{"cached_tokens":234},"output_tokens":478,"output_tokens_details":{"reasoning_tokens":350},"total_tokens":1021},"user":null,"metadata":{}}}\n\n`,
        ],
      };

      const { stream } = await createModel('o3-mini').doStream({
        prompt: TEST_PROMPT,
        providerOptions: {
          openai: {
            reasoningEffort: 'low',
            reasoningSummary: 'auto',
          },
        },
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_67c9a81b6a048190a9ee441c5755a4e8",
            "modelId": "o3-mini-2025-01-31",
            "timestamp": 2025-03-06T13:50:19.000Z,
            "type": "response-metadata",
          },
          {
            "text": "**Exploring burrito origins**

        The user is",
            "type": "reasoning",
          },
          {
            "text": " curious about the debate regarding Taqueria La Cumbre and El Farolito.",
            "type": "reasoning",
          },
          {
            "text": "**Investigating burrito origins**

        There's a fascinating debate about who created the Mission burrito.",
            "type": "reasoning",
          },
          {
            "text": "Taqueria La Cumbre",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "openai": {
                "responseId": "resp_67c9a81b6a048190a9ee441c5755a4e8",
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 234,
              "inputTokens": 543,
              "outputTokens": 478,
              "reasoningTokens": 350,
              "totalTokens": 1021,
            },
          },
        ]
      `);

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: 'o3-mini',
        reasoning: {
          effort: 'low',
          summary: 'auto',
        },
        stream: true,
      });
    });
  });
});
