import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';
import type { OpenAIResponsesSystemMessageOptions } from './openai-responses-language-model-options';

const url = 'https://api.openai.com/v1/responses';
const schema = {
  type: 'object',
  properties: { total: { type: 'integer' } },
  required: ['total'],
  additionalProperties: false,
};
const format = {
  type: 'json_schema',
  name: 'count',
  schema,
  strict: true,
} as const;
const user: LanguageModelV4Prompt[number] = {
  role: 'user',
  content: [{ type: 'text', text: 'Count the crates.' }],
};
const update = (
  options: OpenAIResponsesSystemMessageOptions,
  content = '',
): LanguageModelV4Prompt[number] => ({
  role: 'system',
  content,
  providerOptions: { openai: options },
});

describe.each(['generate', 'stream'] as const)(
  'Responses format updates (%s)',
  method => {
    const server = createTestServer({ [url]: {} });
    async function request(
      options: LanguageModelV4CallOptions,
      modelId = 'gpt-6-sol',
      provider = 'openai.responses',
    ) {
      const response = {
        id: 'resp_test',
        created_at: 0,
        model: modelId,
        output: [],
      };
      server.urls[url].response =
        method === 'generate'
          ? { type: 'json-value', body: response }
          : {
              type: 'stream-chunks',
              chunks: [
                `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
              ],
            };
      const model = new OpenAIResponsesLanguageModel(modelId, {
        provider,
        url: () => url,
        headers: () => ({}),
      });
      if (method === 'generate') return model.doGenerate(options);
      const parts = await convertReadableStreamToArray(
        (await model.doStream(options)).stream,
      );
      expect(parts.filter(part => part.type === 'error')).toEqual([]);
      return {
        warnings: parts.find(part => part.type === 'stream-start')!.warnings,
      };
    }

    it.each(['openai', 'azure'])(
      'preserves combined and format-only updates in %s history',
      async provider => {
        const prompt: LanguageModelV4Prompt = [
          user,
          update({ textFormatUpdate: format, reasoningEffortUpdate: 'high' }),
          user,
        ];
        const options: LanguageModelV4CallOptions = {
          prompt,
          responseFormat: { type: 'json', schema: { type: 'object' } },
          providerOptions: {
            [provider]: {
              textFormat: { type: 'text' },
              reasoningEffort: 'low',
              store: false,
            },
          },
        };
        await request(options, 'gpt-6-sol', `${provider}.responses`);
        const first = await server.calls[0].requestBodyJson;
        expect(first.text.format).toEqual({ type: 'text' });
        expect(first.reasoning.effort).toBe('low');
        expect(first.input[1]).toEqual({
          type: 'configuration_update',
          reasoning: { effort: 'high' },
          text: { format },
        });
        prompt.push(update({ textFormatUpdate: { type: 'text' } }), user);
        await request(options, 'gpt-6-sol', `${provider}.responses`);
        const second = await server.calls[1].requestBodyJson;
        expect(second.input.slice(0, first.input.length)).toEqual(first.input);
        expect(second.input[3]).toEqual({
          type: 'configuration_update',
          text: { format: { type: 'text' } },
        });
        expect(second.text).toEqual(first.text);
      },
    );

    it('normalizes both the original format and historical updates without mutating them', async () => {
      const unnormalized = {
        ...format,
        schema: { ...schema, propertyNames: { type: 'string' } },
      };
      const result = await request({
        prompt: [update({ textFormatUpdate: unnormalized }), user],
        providerOptions: { openai: { textFormat: unnormalized } },
      });
      const body = await server.calls[0].requestBodyJson;
      expect(body.text.format.schema).toEqual(schema);
      expect(body.input[0].text.format.schema).toEqual(schema);
      expect(unnormalized.schema.propertyNames).toEqual({ type: 'string' });
      expect(
        result.warnings.filter(warning => warning.type === 'compatibility'),
      ).toHaveLength(2);
    });

    it('does not apply wire-schema normalization to a schema used only for Output validation', async () => {
      await request({
        prompt: [update({ textFormatUpdate: format }), user],
        responseFormat: {
          type: 'json',
          schema: { type: 'object', propertyNames: { type: 'number' } },
        },
        providerOptions: { openai: { textFormat: { type: 'text' } } },
      });
      expect((await server.calls[0].requestBodyJson).text.format).toEqual({
        type: 'text',
      });
    });

    it('retains the effective reasoning effort across format-only updates', async () => {
      const { warnings } = await request({
        prompt: [
          update({ reasoningEffortUpdate: 'none' }),
          user,
          update({ textFormatUpdate: format }),
          user,
        ],
        temperature: 0.2,
        topP: 0.8,
        providerOptions: {
          openai: { reasoningEffort: 'low', reasoningSummary: null },
        },
      });
      const body = await server.calls[0].requestBodyJson;
      expect(body.temperature).toBe(0.2);
      expect(body.top_p).toBe(0.8);
      expect(warnings).toEqual([]);
    });

    it('supports continuation with previousResponseId', async () => {
      await request({
        prompt: [update({ textFormatUpdate: format }), user],
        providerOptions: { openai: { previousResponseId: 'resp_previous' } },
      });
      const body = await server.calls[0].requestBodyJson;
      expect(body.previous_response_id).toBe('resp_previous');
      expect(body.text).toBeUndefined();
      expect(body.input[0]).toEqual({
        type: 'configuration_update',
        text: { format },
      });
    });

    it.each([
      { reasoningMode: 'pro' },
      { contextManagement: [{ type: 'compaction', compactThreshold: 1000 }] },
      { truncation: 'auto' },
    ])('rejects incompatible settings %j', async options => {
      await expect(
        request({
          prompt: [update({ textFormatUpdate: format }), user],
          providerOptions: { openai: options },
        }),
      ).rejects.toMatchObject({
        name: 'AI_UnsupportedFunctionalityError',
        functionality: 'Message-level textFormatUpdate',
      });
      expect(server.calls).toHaveLength(0);
    });

    it('rejects unsupported models instead of silently losing historical updates', async () => {
      await expect(
        request(
          { prompt: [update({ textFormatUpdate: format }), user] },
          'gpt-5.4',
        ),
      ).rejects.toMatchObject({
        name: 'AI_UnsupportedFunctionalityError',
        functionality: 'Message-level textFormatUpdate',
      });
      expect(server.calls).toHaveLength(0);
    });

    it('requires an empty control message', async () => {
      await expect(
        request({
          prompt: [update({ textFormatUpdate: format }, 'Instructions'), user],
        }),
      ).rejects.toThrow(
        'Message-level textFormatUpdate requires empty system message content.',
      );
    });

    it('rejects adjacent reasoning and format updates', async () => {
      await expect(
        request({
          prompt: [
            update({ reasoningEffortUpdate: 'low' }),
            update({ textFormatUpdate: format }),
            user,
          ],
        }),
      ).rejects.toThrow('Adjacent reasoning effort configuration updates');
    });

    it('allows explicit compaction after configuration updates', async () => {
      await request({
        prompt: [update({ textFormatUpdate: format }), user],
        providerOptions: { openai: { compactionTrigger: true } },
      });
      expect((await server.calls[0].requestBodyJson).input.at(-1)).toEqual({
        type: 'compaction_trigger',
      });
    });

    it('rejects json_object as an update format', async () => {
      await expect(
        request({
          prompt: [
            {
              role: 'system',
              content: '',
              providerOptions: {
                openai: { textFormatUpdate: { type: 'json_object' } },
              },
            },
            user,
          ],
        }),
      ).rejects.toMatchObject({ name: 'AI_InvalidArgumentError' });
    });
  },
);
