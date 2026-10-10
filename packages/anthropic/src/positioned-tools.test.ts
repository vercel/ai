import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnthropicLanguageModel } from './anthropic-language-model';
import { createAnthropic } from './anthropic-provider';

const url = 'https://api.anthropic.com/v1/messages';
const server = createTestServer({ [url]: {} });
const provider = createAnthropic({ apiKey: 'test-key' });
const definition = {
  type: 'function' as const,
  name: 'lookup',
  description: 'Look up an order',
  inputSchema: {
    type: 'object' as const,
    properties: { id: { type: 'string' as const } },
  },
  strict: true,
  inputExamples: [{ input: { id: '1' } }],
  providerOptions: {
    anthropic: {
      deferLoading: true,
      allowedCallers: ['direct'],
      eagerInputStreaming: true,
    },
  },
};
const wireDefinition = {
  name: 'lookup',
  description: 'Look up an order',
  input_schema: definition.inputSchema,
  strict: true,
  defer_loading: true,
  allowed_callers: ['direct'],
  eager_input_streaming: true,
  input_examples: [{ id: '1' }],
};
const user = {
  role: 'user' as const,
  content: [{ type: 'text' as const, text: 'Look up an order.' }],
};
async function call(method: string, options: LanguageModelV4CallOptions) {
  const model = provider('claude-opus-5-5');
  if (method === 'generate') {
    server.urls[url].response = {
      type: 'json-value',
      body: JSON.parse(
        readFileSync('src/__fixtures__/anthropic-text.json', 'utf8'),
      ),
    };
    await model.doGenerate(options);
  } else {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: readFileSync('src/__fixtures__/anthropic-text.chunks.txt', 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => `data: ${line}\n\n`),
    };
    const { stream } = await model.doStream(options);
    await convertReadableStreamToArray(stream);
  }
}
describe('inline function definitions', () => {
  it.each(['generate', 'stream'])(
    'preserves definitions, references, text and effort through %s and replay',
    async method => {
      const prompt: LanguageModelV4Prompt = [
        { role: 'system', content: 'Initial instructions' },
        user,
        {
          role: 'system',
          content: 'Lookup is available now.',
          providerOptions: {
            anthropic: {
              effort: 'high',
              toolChanges: [
                { type: 'tool_addition', tool: definition },
                { type: 'tool_removal', toolName: 'initial' },
              ],
            },
          },
        },
        { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
        user,
        {
          role: 'system',
          content: '',
          providerOptions: {
            anthropic: {
              toolChanges: [
                { type: 'tool_removal', toolName: 'lookup' },
                { type: 'tool_addition', toolName: 'lookup' },
                {
                  type: 'tool_addition',
                  tool: { ...definition, name: 'lookup_next' },
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
        providerOptions: { anthropic: { effort: 'low', toolStreaming: false } },
      };
      await call(method, options);
      const first = await server.calls[0].requestBodyJson;
      expect(first.tools).toEqual([{ ...wireDefinition, name: 'initial' }]);
      expect(first.system).toEqual([
        { type: 'text', text: 'Initial instructions' },
      ]);
      expect(first.output_config.effort).toBe('low');
      expect(first.messages).toEqual([
        { role: 'user', content: user.content },
        {
          role: 'system',
          content: [
            { type: 'text', text: 'Lookup is available now.' },
            {
              type: 'tool_addition',
              tool: { type: 'tool_definition', definition: wireDefinition },
            },
            {
              type: 'tool_removal',
              tool: { type: 'tool_reference', name: 'initial' },
            },
          ],
          output_config: { effort: 'high' },
        },
        { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
        { role: 'user', content: user.content },
        {
          role: 'system',
          content: [
            {
              type: 'tool_removal',
              tool: { type: 'tool_reference', name: 'lookup' },
            },
            {
              type: 'tool_addition',
              tool: { type: 'tool_reference', name: 'lookup' },
            },
            {
              type: 'tool_addition',
              tool: {
                type: 'tool_definition',
                definition: { ...wireDefinition, name: 'lookup_next' },
              },
            },
          ],
        },
      ]);
      const betas = server.calls[0].requestHeaders['anthropic-beta'];
      expect(betas).toContain('inline-tools-2026-09-15');
      expect(betas).toContain('advanced-tool-use-2025-11-20');
      expect(betas).toContain('mid-conversation-output-config-2026-07-01');
      expect(betas).not.toContain('mid-conversation-tool-changes-2026-07-01');
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
      expect(replay.messages.slice(0, first.messages.length)).toEqual(
        first.messages,
      );
      expect(server.calls[1].requestHeaders['anthropic-beta']).toBe(betas);
      expect(prompt).toEqual(original);
    },
  );

  it.each(['generate', 'stream'])(
    'rejects initial definitions before %s fetch',
    async method => {
      await expect(
        call(method, {
          prompt: [
            {
              role: 'system',
              content: '',
              providerOptions: {
                anthropic: {
                  toolChanges: [{ type: 'tool_addition', tool: definition }],
                },
              },
            },
            user,
          ],
        }),
      ).rejects.toMatchObject({ functionality: 'Message-level toolChanges' });
      expect(server.calls).toHaveLength(0);
    },
  );

  it.each([
    { type: 'tool_addition', toolName: 'lookup', tool: definition },
    { type: 'tool_addition' },
    { type: 'tool_removal', tool: definition },
    { type: 'tool_removal', toolName: 'lookup', tool: definition },
    { type: 'tool_addition', tool: { ...definition, inputSchema: 'bad' } },
    {
      type: 'tool_addition',
      tool: {
        type: 'provider',
        id: 'anthropic.web_search',
        name: 'search',
        args: {},
      },
    },
  ])('rejects ambiguous or invalid changes %j', async change => {
    await expect(
      call('generate', {
        prompt: [
          user,
          {
            role: 'system',
            content: '',
            providerOptions: { anthropic: { toolChanges: [change] } },
          },
        ],
      }),
    ).rejects.toThrow();
    expect(server.calls).toHaveLength(0);
  });
  it('rejects inline strict tools when the adapter cannot serialize strict', async () => {
    const model = new AnthropicLanguageModel('claude-opus-5-5', {
      provider: 'anthropic',
      baseURL: 'https://api.anthropic.com/v1',
      headers: { 'x-api-key': 'test' },
      supportsStrictTools: false,
    });
    await expect(
      model.doGenerate({
        prompt: [
          user,
          {
            role: 'system',
            content: '',
            providerOptions: {
              anthropic: {
                toolChanges: [{ type: 'tool_addition', tool: definition }],
              },
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ functionality: 'Message-level toolChanges' });
    expect(server.calls).toHaveLength(0);
  });
});
