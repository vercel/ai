import {
  type LanguageModelV2Prompt,
  type SharedV2ProviderOptions,
  type LanguageModelV2CallWarning,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';
import type {
  OpenAIResponsesProviderOptions,
  OpenAIResponsesSystemMessageOptions,
} from './openai-responses-options';

const url = 'https://api.openai.com/v1/responses';
const user: LanguageModelV2Prompt[number] = {
  role: 'user',
  content: [{ type: 'text', text: 'Question' }],
};
const wireUser = {
  role: 'user',
  content: [{ type: 'input_text', text: 'Question' }],
};
const update = (
  effort: NonNullable<
    OpenAIResponsesSystemMessageOptions['reasoningEffortUpdate']
  >,
  content = '',
): LanguageModelV2Prompt[number] => ({
  role: 'system',
  content,
  providerOptions: {
    openai: { reasoningEffortUpdate: effort },
  },
});
const wireUpdate = (effort: string) => ({
  type: 'configuration_update',
  reasoning: { effort },
});

describe.each(['generate', 'stream'] as const)(
  'positioned reasoning effort updates (%s)',
  method => {
    const server = createTestServer({ [url]: {} });

    async function request(
      prompt: LanguageModelV2Prompt,
      options: OpenAIResponsesProviderOptions = {},
      modelId = 'gpt-6-astra',
      provider = 'openai.responses',
    ) {
      const model = new OpenAIResponsesLanguageModel(modelId, {
        provider,
        url: () => url,
        headers: () => ({}),
      });
      const response = {
        id: 'resp_test',
        created_at: 0,
        model: modelId,
        output: [],
        usage: { input_tokens: 1, output_tokens: 1 },
      };
      server.urls[url].response =
        method === 'generate'
          ? { type: 'json-value', body: response }
          : {
              type: 'stream-chunks',
              chunks: [
                `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
                'data: [DONE]\n\n',
              ],
            };
      const args = { prompt, providerOptions: { openai: options } };
      let warnings: LanguageModelV2CallWarning[];
      if (method === 'generate') {
        warnings = (await model.doGenerate(args)).warnings;
      } else {
        const { stream } = await model.doStream(args);
        const parts = await convertReadableStreamToArray(stream);
        expect(parts.filter(part => part.type === 'error')).toEqual([]);
        warnings = parts.find(part => part.type === 'stream-start')!.warnings;
      }
      const body = await server.calls[0].requestBodyJson;
      expect(body.stream).toBe(method === 'stream' ? true : undefined);
      return { body, warnings };
    }

    it.each(['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'])(
      'retains multiple updates among messages for %s',
      async modelId => {
        const { body, warnings } = await request(
          [
            user,
            { role: 'assistant', content: [{ type: 'text', text: 'Answer' }] },
            update('high'),
            user,
            update('low'),
            user,
          ],
          { reasoningEffort: 'medium', store: false },
          modelId,
        );
        expect(body.input).toEqual([
          wireUser,
          {
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Answer' }],
          },
          wireUpdate('high'),
          wireUser,
          wireUpdate('low'),
          wireUser,
        ]);
        expect(body.reasoning.effort).toBe('medium');
        expect(warnings).toEqual([]);
      },
    );

    it.each<{
      name: string;
      providerOptions: SharedV2ProviderOptions;
      expected: unknown;
    }>([
      {
        name: 'Azure options',
        providerOptions: { azure: { reasoningEffortUpdate: 'high' } },
        expected: wireUpdate('high'),
      },
      {
        name: 'OpenAI options fallback',
        providerOptions: { openai: { reasoningEffortUpdate: 'high' } },
        expected: wireUpdate('high'),
      },
      {
        name: 'Azure options taking precedence',
        providerOptions: {
          azure: { reasoningEffortUpdate: 'low' },
          openai: { reasoningEffortUpdate: 'high' },
        },
        expected: wireUpdate('low'),
      },
      {
        name: 'explicit empty Azure options',
        providerOptions: {
          azure: {},
          openai: { reasoningEffortUpdate: 'high' },
        },
        expected: { role: 'developer', content: '' },
      },
    ])(
      'supports $name on Azure messages',
      async ({ providerOptions, expected }) => {
        const { body } = await request(
          [user, { role: 'system', content: '', providerOptions }, user],
          {},
          'gpt-6-astra',
          'azure.responses',
        );
        expect(body.input).toEqual([wireUser, expected, wireUser]);
      },
    );

    it('rejects unsupported Azure configurations when using OpenAI message options', async () => {
      await expect(
        request(
          [user, update('high'), user],
          { truncation: 'auto' },
          'gpt-6-astra',
          'azure.responses',
        ),
      ).rejects.toMatchObject({
        name: 'AI_UnsupportedFunctionalityError',
        functionality: 'Message-level reasoningEffortUpdate',
      });
      expect(server.calls).toHaveLength(0);
    });

    it('keeps the request-level update prepended and historical updates positioned', async () => {
      const { body, warnings } = await request([user, update('high'), user], {
        reasoningEffort: 'low',
        reasoningEffortUpdate: 'medium',
      });
      expect(body.input).toEqual([
        wireUpdate('medium'),
        wireUser,
        wireUpdate('high'),
        wireUser,
      ]);
      expect(body.reasoning.effort).toBe('low');
      expect(warnings).toEqual([]);
    });

    it('uses an identical first historical update without prepending a duplicate', async () => {
      const prompt = [update('high'), user];
      const original = structuredClone(prompt);
      const { body, warnings } = await request(prompt, {
        reasoningEffort: 'low',
        reasoningSummary: 'concise',
        reasoningEffortUpdate: 'high',
      });
      expect(body.input).toEqual([wireUpdate('high'), wireUser]);
      expect(body.reasoning).toEqual({ effort: 'low', summary: 'concise' });
      expect(warnings).toEqual([]);
      expect(prompt).toEqual(original);
    });

    it('prepends when an identical historical update is not the first item', async () => {
      const { body, warnings } = await request([user, update('high'), user], {
        reasoningEffortUpdate: 'high',
      });
      expect(body.input).toEqual([
        wireUpdate('high'),
        wireUser,
        wireUpdate('high'),
        wireUser,
      ]);
      expect(warnings).toEqual([]);
    });

    it('preserves request-level continuation behavior', async () => {
      const { body, warnings } = await request([user], {
        previousResponseId: 'resp_previous',
        reasoningEffort: 'low',
        reasoningEffortUpdate: 'high',
      });
      expect(body.input).toEqual([wireUpdate('high'), wireUser]);
      expect(body.previous_response_id).toBe('resp_previous');
      expect(body.reasoning.effort).toBe('low');
      expect(warnings).toEqual([]);
    });

    describe.each([
      {
        options: { previousResponseId: 'resp_previous' },
        field: 'previous_response_id',
        value: 'resp_previous',
      },
      {
        options: { conversation: 'conv_test' },
        field: 'conversation',
        value: 'conv_test',
      },
    ])(
      'message-level continuation with $field',
      ({ options, field, value }) => {
        it('preserves positioned updates in continuation input', async () => {
          const { body, warnings } = await request([update('high'), user], {
            ...options,
            reasoningEffort: 'low',
          });
          expect(body[field]).toBe(value);
          expect(body.input).toEqual([wireUpdate('high'), wireUser]);
          expect(body.reasoning.effort).toBe('low');
          expect(warnings).toEqual([]);
        });
      },
    );

    describe.each([
      { model: 'gpt-5.6', options: {} },
      { model: 'custom-model', options: {} },
      { model: 'gpt-6-astra', options: { reasoningMode: 'pro' } },
      { model: 'gpt-6-astra', options: { truncation: 'auto' } },
    ] satisfies Array<{
      model: string;
      options: OpenAIResponsesProviderOptions;
    }>)('unsupported configuration: $model $options', ({ model, options }) => {
      it('rejects historical updates before sending and preserves caller input', async () => {
        const prompt = [update('high'), user];
        const providerOptions = { ...options };
        const original = structuredClone({ prompt, providerOptions });
        await expect(
          request(prompt, providerOptions, model),
        ).rejects.toMatchObject({
          name: 'AI_UnsupportedFunctionalityError',
          functionality: 'Message-level reasoningEffortUpdate',
        });
        expect(server.calls).toHaveLength(0);
        expect({ prompt, providerOptions }).toEqual(original);
      });

      it('preserves legacy request-level warn-and-omit behavior', async () => {
        const { body, warnings } = await request(
          [user],
          { ...options, reasoningEffortUpdate: 'low' },
          model,
        );
        expect(body.input).toEqual([wireUser]);
        expect(
          warnings.filter(
            w =>
              w.type === 'unsupported-setting' &&
              w.setting === 'reasoningEffortUpdate',
          ),
        ).toHaveLength(1);
      });
    });

    it.each(['Instructions', ' '])(
      'rejects mixed text %j before sending',
      async content => {
        await expect(
          request([update('high', content), user]),
        ).rejects.toMatchObject({
          name: 'AI_UnsupportedFunctionalityError',
          functionality: 'Message-level reasoningEffortUpdate',
          message:
            'Message-level reasoningEffortUpdate requires empty system message content.',
        });
        expect(server.calls).toHaveLength(0);
      },
    );

    it('preserves ordinary empty system messages', async () => {
      const { body } = await request([{ role: 'system', content: '' }, user]);
      expect(body.input).toEqual([
        { role: 'developer', content: '' },
        wireUser,
      ]);
    });

    it.each([
      { prompt: [update('high'), update('low'), user], options: {} },
      { prompt: [update('high'), update('high'), user], options: {} },
      {
        prompt: [update('high'), update('high'), user],
        options: { reasoningEffortUpdate: 'high' },
      },
      {
        prompt: [update('high'), user],
        options: { reasoningEffortUpdate: 'low' },
      },
    ] satisfies Array<{
      prompt: LanguageModelV2Prompt;
      options: OpenAIResponsesProviderOptions;
    }>)(
      'rejects adjacent serialized updates before sending: $options',
      async ({ prompt, options }) => {
        await expect(request(prompt, options)).rejects.toMatchObject({
          name: 'AI_UnsupportedFunctionalityError',
          functionality: 'Adjacent reasoning effort configuration updates',
        });
        expect(server.calls).toHaveLength(0);
      },
    );

    it('validates message-level effort values', async () => {
      await expect(
        request([
          {
            role: 'system',
            content: '',
            providerOptions: { openai: { reasoningEffortUpdate: 'none' } },
          },
          user,
        ]),
      ).rejects.toMatchObject({ name: 'AI_InvalidArgumentError' });
      expect(server.calls).toHaveLength(0);
    });
  },
);
