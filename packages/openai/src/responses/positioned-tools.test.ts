import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOpenAI } from '../openai-provider';

const url = 'https://api.openai.com/v1/responses';
const server = createTestServer({ [url]: {} });
const provider = createOpenAI({ apiKey: 'test-key' });
const definition = {
  type: 'function' as const,
  name: 'lookup',
  description: 'Look up an order',
  inputSchema: {
    type: 'object' as const,
    properties: { id: { type: 'string' as const } },
    required: ['id'],
    additionalProperties: false,
  },
  strict: true,
  providerOptions: { openai: { deferLoading: true } },
};
const wireTool = {
  type: 'function',
  name: 'lookup',
  description: 'Look up an order',
  parameters: definition.inputSchema,
  strict: true,
  defer_loading: true,
};
const user = {
  role: 'user' as const,
  content: [{ type: 'text' as const, text: 'Look up an order.' }],
};

async function call(
  method: string,
  options: LanguageModelV4CallOptions,
  modelId = 'gpt-6-astra',
) {
  const model = provider.responses(modelId);
  if (method === 'generate') {
    server.urls[url].response = {
      type: 'json-value',
      body: JSON.parse(
        readFileSync('src/responses/__fixtures__/openai-phase.1.json', 'utf8'),
      ),
    };
    await model.doGenerate(options);
  } else {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: readFileSync(
        'src/responses/__fixtures__/openai-phase.1.chunks.txt',
        'utf8',
      )
        .split('\n')
        .filter(Boolean)
        .map(line => `data: ${line}\n\n`),
    };
    const { stream } = await model.doStream(options);
    await convertReadableStreamToArray(stream);
  }
}

describe('positioned additional tools', () => {
  it.each(['generate', 'stream'])(
    'preserves additions and effort through %s and replay',
    async method => {
      const prompt: LanguageModelV4Prompt = [
        { role: 'system', content: 'Initial instructions' },
        user,
        {
          role: 'system',
          content: '',
          providerOptions: {
            openai: {
              additionalTools: [definition],
              reasoningEffortUpdate: 'high',
            },
          },
        },
        { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
        user,
        {
          role: 'system',
          content: '',
          providerOptions: {
            openai: {
              additionalTools: [
                {
                  ...definition,
                  name: 'lookup_next',
                  providerOptions: {
                    openai: {
                      namespace: { name: 'orders', description: 'Order tools' },
                    },
                  },
                },
              ],
            },
          },
        },
      ];
      const original = structuredClone(prompt);
      const options = {
        prompt,
        tools: [{ ...definition, name: 'initial' }],
        providerOptions: { openai: { reasoningEffort: 'low' } },
      };
      await call(method, options);
      const first = await server.calls[0].requestBodyJson;
      expect(first.tools).toEqual([{ ...wireTool, name: 'initial' }]);
      expect(first.reasoning.effort).toBe('low');
      expect(first.input).toEqual([
        { role: 'developer', content: 'Initial instructions' },
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'Look up an order.' }],
        },
        { type: 'configuration_update', reasoning: { effort: 'high' } },
        { type: 'additional_tools', role: 'developer', tools: [wireTool] },
        { role: 'assistant', content: 'Done.' },
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'Look up an order.' }],
        },
        {
          type: 'additional_tools',
          role: 'developer',
          tools: [
            {
              type: 'namespace',
              name: 'orders',
              description: 'Order tools',
              tools: [
                { ...wireTool, name: 'lookup_next', defer_loading: undefined },
              ],
            },
          ],
        },
      ]);
      await call(method, {
        ...options,
        prompt: [
          ...prompt,
          { role: 'assistant', content: [{ type: 'text', text: 'Again.' }] },
          user,
        ],
      });
      const replay = await server.calls[1].requestBodyJson;
      expect(replay.tools).toEqual(first.tools);
      expect(replay.input.slice(0, first.input.length)).toEqual(first.input);
      expect(prompt).toEqual(original);
    },
  );

  it.each(['generate', 'stream'])(
    'does not impose effort restrictions on additions in %s',
    async method => {
      await call(
        method,
        {
          prompt: [
            {
              role: 'system',
              content: '',
              providerOptions: { openai: { additionalTools: [definition] } },
            },
            {
              role: 'system',
              content: '',
              providerOptions: { openai: { additionalTools: [definition] } },
            },
            user,
          ],
          providerOptions: {
            openai: {
              systemMessageMode: 'remove',
              reasoningMode: 'pro',
              truncation: 'auto',
              contextManagement: [
                { type: 'compaction', compactThreshold: 1000 },
              ],
            },
          },
        },
        'gpt-5.4',
      );
      const body = await server.calls[0].requestBodyJson;
      expect(body.input.slice(0, 2)).toEqual(
        Array(2).fill({
          type: 'additional_tools',
          role: 'developer',
          tools: [wireTool],
        }),
      );
    },
  );

  it.each(['generate', 'stream'])(
    'rejects text on an addition carrier before %s fetch',
    async method => {
      await expect(
        call(method, {
          prompt: [
            {
              role: 'system',
              content: 'Do not lose this.',
              providerOptions: { openai: { additionalTools: [definition] } },
            },
          ],
        }),
      ).rejects.toMatchObject({
        name: 'AI_UnsupportedFunctionalityError',
        functionality: 'Message-level additionalTools',
      });
      expect(server.calls).toHaveLength(0);
    },
  );

  it('rejects unsupported historical tool settings', async () => {
    await expect(
      call(
        'generate',
        {
          prompt: [
            {
              role: 'system',
              content: '',
              providerOptions: {
                openai: {
                  additionalTools: [
                    {
                      ...definition,
                      providerOptions: { openai: { async: true } },
                    },
                  ],
                },
              },
            },
            user,
          ],
        },
        'gpt-5.4',
      ),
    ).rejects.toMatchObject({ functionality: 'Message-level additionalTools' });
    expect(server.calls).toHaveLength(0);
  });

  it.each(
    [
      [],
      [{ type: 'provider', name: 'search', id: 'openai.web_search', args: {} }],
      [{ ...definition, inputSchema: 'bad' }],
    ].map(additionalTools => ({ additionalTools })),
  )('rejects malformed definitions %j', async ({ additionalTools }) => {
    await expect(
      call('generate', {
        prompt: [
          {
            role: 'system',
            content: '',
            providerOptions: { openai: { additionalTools } },
          },
        ],
      }),
    ).rejects.toThrow();
    expect(server.calls).toHaveLength(0);
  });

  it('tracks output schemas for positioned tool results', async () => {
    await call('generate', {
      prompt: [
        user,
        {
          role: 'system',
          content: '',
          providerOptions: {
            openai: {
              additionalTools: [
                {
                  ...definition,
                  providerOptions: {
                    openai: { outputSchema: { type: 'string' } },
                  },
                },
              ],
            },
          },
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_lookup',
              toolName: 'lookup',
              input: { id: '1' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_lookup',
              toolName: 'lookup',
              output: { type: 'text', value: 'shipped' },
            },
          ],
        },
      ],
    });
    const body = await server.calls[0].requestBodyJson;
    expect(body.input.at(-1)).toMatchObject({
      type: 'function_call_output',
      output: '"shipped"',
    });
  });
  it('labels converter failures as positioned addition errors', async () => {
    await expect(
      call('generate', {
        prompt: [
          user,
          {
            role: 'system',
            content: '',
            providerOptions: {
              openai: {
                additionalTools: [
                  {
                    ...definition,
                    providerOptions: {
                      openai: {
                        namespace: { name: 'orders', description: 'one' },
                      },
                    },
                  },
                  {
                    ...definition,
                    name: 'other',
                    providerOptions: {
                      openai: {
                        namespace: { name: 'orders', description: 'two' },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ functionality: 'Message-level additionalTools' });
    expect(server.calls).toHaveLength(0);
  });
});
