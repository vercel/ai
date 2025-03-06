import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createOpenAI } from '../openai-provider';

const provider = createOpenAI({ apiKey: 'test-api-key' });
const model = provider.responses('gpt-4o-mini');

describe('OpenAIResponsesLanguageModel', () => {
  const server = createTestServer({
    'https://api.openai.com/v1/responses': {},
  });

  describe('doGenerate', () => {
    it('should generate text', async () => {
      const responseText = 'answer text';

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
                  text: responseText,
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

      const result = await model.doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Hello, World!' }] },
        ],
        inputFormat: 'prompt',
        mode: { type: 'regular' },
      });

      expect(result.text).toStrictEqual(responseText);
    });
  });
});
