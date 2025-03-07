import {
  convertReadableStreamToArray,
  createTestServer,
} from '@ai-sdk/provider-utils/test';
import { createOpenAI } from '../openai-provider';
import { LanguageModelV1Prompt } from '@ai-sdk/provider';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createOpenAI({ apiKey: 'test-api-key' });
const model = provider.responses('gpt-4o-mini');

describe('OpenAIResponsesLanguageModel', () => {
  const server = createTestServer({
    'https://api.openai.com/v1/responses': {},
  });

  function prepareJsonResponse({ text = '' }: { text?: string }) {
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
        model: 'gpt-4o-mini-2024-07-18',
        output: [
          {
            id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text,
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
  }

  describe('doGenerate', () => {
    it('should generate text', async () => {
      prepareJsonResponse({ text: 'answer text' });

      const result = await model.doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Hello, World!' }] },
        ],
        inputFormat: 'prompt',
        mode: { type: 'regular' },
      });

      expect(result.text).toStrictEqual('answer text');
    });

    it('should send model id and settings', async () => {
      prepareJsonResponse({});

      const { warnings } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        temperature: 0.5,
        topP: 0.3,
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'gpt-4o-mini',
        temperature: 0.5,
        top_p: 0.3,
        input: [
          { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
        ],
      });

      expect(warnings).toStrictEqual([]);
    });

    it('should send json schema format', async () => {
      prepareJsonResponse({});

      const { warnings } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-json',
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

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'gpt-4o-mini',
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

    it('should send json object format', async () => {
      prepareJsonResponse({});

      const { warnings } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'object-json' },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'gpt-4o-mini',
        text: { format: { type: 'json_object' } },
        input: [
          { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
        ],
      });

      expect(warnings).toStrictEqual([]);
    });

    it('should warn about unsupported settings', async () => {
      prepareJsonResponse({});

      const { warnings } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        topK: 0.1,
      });

      expect(warnings).toStrictEqual([
        { type: 'unsupported-setting', setting: 'topK' },
      ]);
    });
  });

  describe('doStream', () => {
    it('should stream text deltas', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-mini-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.in_progress","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-mini-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"msg_67c9a81dea8c8190b79651a2b3adf91e","type":"message","status":"in_progress","role":"assistant","content":[]}}\n\n`,
          `data:{"type":"response.content_part.added","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"delta":"Hello,"}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"delta":" World!"}\n\n`,
          `data:{"type":"response.output_text.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"text":"Hello, World!"}\n\n`,
          `data:{"type":"response.content_part.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"part":{"type":"output_text","text":"Hello, World!","annotations":[]}}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Hello, World!","annotations":[]}]}}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_67c9a878139c8190aa2e3105411b408b","object":"response","created_at":1741269112,"status":"completed","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-mini-2024-07-18","output":[{"id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Hello, World!","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":{"input_tokens":34,"output_tokens":478,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":512},"user":null,"metadata":{}}}\n\n`,
        ],
      };

      const { stream } = await model.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        // {
        //   type: 'response-metadata',
        //   id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
        //   modelId: 'claude-3-haiku-20240307',
        // },
        { type: 'text-delta', textDelta: 'Hello,' },
        { type: 'text-delta', textDelta: ' World!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: {
            completionTokens: 478,
            promptTokens: 34,
          },
        },
      ]);
    });

    it('should send finish reason for incomplete response', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-mini-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.in_progress","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-mini-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"msg_67c9a81dea8c8190b79651a2b3adf91e","type":"message","status":"in_progress","role":"assistant","content":[]}}\n\n`,
          `data:{"type":"response.content_part.added","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"delta":"Hello,"}\n\n`,
          `data:{"type":"response.output_text.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"text":"Hello,!"}\n\n`,
          `data:{"type":"response.content_part.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"part":{"type":"output_text","text":"Hello,","annotations":[]}}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","type":"message","status":"incomplete","role":"assistant","content":[{"type":"output_text","text":"Hello,","annotations":[]}]}}\n\n`,
          `data:{"type":"response.incomplete","response":{"id":"resp_67cadb40a0708190ac2763c0b6960f6f","object":"response","created_at":1741347648,"status":"incomplete","error":null,"incomplete_details":{"reason":"max_output_tokens"},"instructions":null,"max_output_tokens":100,"model":"gpt-4o-mini-2024-07-18","output":[{"type":"message","id":"msg_67cadb410ccc81909fe1d8f427b9cf02","status":"incomplete","role":"assistant","content":[{"type":"output_text","text":"Hello,","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":{"input_tokens":0,"input_tokens_details":{"cached_tokens":0},"output_tokens":0,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":0},"user":null,"metadata":{}}}\n\n`,
        ],
      };

      const { stream } = await model.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        // {
        //   type: 'response-metadata',
        //   id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
        //   modelId: 'claude-3-haiku-20240307',
        // },
        { type: 'text-delta', textDelta: 'Hello,' },
        {
          type: 'finish',
          finishReason: 'length',
          usage: {
            completionTokens: 0,
            promptTokens: 0,
          },
        },
      ]);
    });
  });
});
