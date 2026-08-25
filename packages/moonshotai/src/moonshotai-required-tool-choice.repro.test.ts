import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MoonshotAIChatModelId } from './moonshotai-chat-options';
import { createMoonshotAI } from './moonshotai-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Call the ping tool.' }],
  },
];

const TEST_TOOLS: LanguageModelV4CallOptions['tools'] = [
  {
    type: 'function',
    name: 'ping',
    description: 'Return pong',
    inputSchema: { type: 'object', properties: {} },
  },
];

const unsupportedModels = [
  'kimi-k2.6',
  'kimi-k2.7-code',
  'kimi-k2.7-code-highspeed',
] as const;

const requests: Array<Record<string, unknown>> = [];

function readFixture(filename: string): unknown {
  return JSON.parse(
    fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
  );
}

const fetch: FetchFunction = async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  requests.push(body);

  if (
    unsupportedModels.includes(
      body.model as (typeof unsupportedModels)[number],
    ) &&
    body.tool_choice === 'required'
  ) {
    return new Response(
      JSON.stringify(readFixture('moonshotai-required-tool-choice-error')),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  const fixture =
    body.model === 'kimi-k3'
      ? 'moonshotai-k3-required-tool-choice'
      : body.model === 'kimi-k2.7-code' ||
          body.model === 'kimi-k2.7-code-highspeed'
        ? 'moonshotai-k2.7-tool-choice-omitted'
        : 'moonshotai-k2.6-tool-choice-omitted';

  return new Response(JSON.stringify(readFixture(fixture)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const provider = createMoonshotAI({
  apiKey: 'test-api-key',
  fetch,
});

async function callModel({
  modelId,
  toolChoice,
}: {
  modelId: MoonshotAIChatModelId;
  toolChoice: NonNullable<LanguageModelV4CallOptions['toolChoice']>;
}) {
  requests.length = 0;
  const result = await provider.chatModel(modelId).doGenerate({
    prompt: TEST_PROMPT,
    tools: TEST_TOOLS,
    toolChoice,
  });

  return { request: requests[0], result };
}

describe('issue #19553 required tool choice', () => {
  it.each(unsupportedModels)(
    'omits required and warns for %s so the provider does not reject the request',
    async modelId => {
      const { request, result } = await callModel({
        modelId,
        toolChoice: { type: 'required' },
      });

      expect(request).not.toHaveProperty('tool_choice');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({ type: 'unsupported' });

      const warning = result.warnings[0];
      if (warning?.type !== 'unsupported') {
        throw new Error('expected an unsupported warning');
      }
      expect(warning.feature).toContain('required');
      expect(warning.feature).toContain(modelId);
    },
  );

  it('keeps required for kimi-k3', async () => {
    const { request, result } = await callModel({
      modelId: 'kimi-k3',
      toolChoice: { type: 'required' },
    });

    expect(request.tool_choice).toBe('required');
    expect(result.warnings).toEqual([]);
  });

  it('keeps required for unknown custom model IDs', async () => {
    const { request, result } = await callModel({
      modelId: 'custom-kimi-model',
      toolChoice: { type: 'required' },
    });

    expect(request.tool_choice).toBe('required');
    expect(result.warnings).toEqual([]);
  });

  it.each([
    [{ type: 'auto' } as const, 'auto'],
    [{ type: 'none' } as const, 'none'],
    [
      { type: 'tool', toolName: 'ping' } as const,
      { type: 'function', function: { name: 'ping' } },
    ],
  ])(
    'keeps other tool-choice modes unchanged',
    async (toolChoice, expected) => {
      const { request, result } = await callModel({
        modelId: 'kimi-k2.6',
        toolChoice,
      });

      expect(request.tool_choice).toEqual(expected);
      expect(result.warnings).toEqual([]);
    },
  );
});
