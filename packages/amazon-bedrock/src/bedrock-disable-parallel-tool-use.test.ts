import type {
  LanguageModelV2CallWarning,
  LanguageModelV2FunctionTool,
} from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const prompt = [
  {
    role: 'user' as const,
    content: [
      {
        type: 'text' as const,
        text: 'Look up the values of R1 and C1. You may call both tools in the same step.',
      },
    ],
  },
];

const tools: LanguageModelV2FunctionTool[] = [
  {
    type: 'function' as const,
    name: 'get_resistor_value',
    description: 'Look up a resistor value',
    inputSchema: {
      type: 'object',
      properties: { ref: { type: 'string' } },
      required: ['ref'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'get_capacitor_value',
    description: 'Look up a capacitor value',
    inputSchema: {
      type: 'object',
      properties: { ref: { type: 'string' } },
      required: ['ref'],
      additionalProperties: false,
    },
  },
];

function readFixture(name: string) {
  return JSON.parse(
    fs.readFileSync(`src/__fixtures__/${name}.json`, 'utf8'),
  ) as unknown;
}

function containsDisableParallelToolUse(value: unknown): boolean {
  if (value == null || typeof value !== 'object') {
    return false;
  }

  if (
    'disable_parallel_tool_use' in value &&
    value.disable_parallel_tool_use === true
  ) {
    return true;
  }

  return Object.values(value).some(containsDisableParallelToolUse);
}

function warnsThatOptionIsUnsupported(warnings: LanguageModelV2CallWarning[]) {
  return warnings.some(warning =>
    JSON.stringify(warning).includes('disableParallelToolUse'),
  );
}

describe('disableParallelToolUse', () => {
  it('serializes tool calls or emits a warning instead of silently ignoring the option', async () => {
    const model = new BedrockChatLanguageModel(
      'global.anthropic.claude-sonnet-4-6',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        generateId: () => 'test-id',
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(String(init?.body));
          const fixture = containsDisableParallelToolUse(requestBody)
            ? 'bedrock-disable-parallel-tool-use-enabled'
            : 'bedrock-disable-parallel-tool-use-ignored';

          return Response.json(readFixture(fixture));
        },
      },
    );

    const result = await model.doGenerate({
      prompt,
      tools,
      toolChoice: { type: 'auto' },
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 4000 },
          sendReasoning: true,
          disableParallelToolUse: true,
        },
      },
    });

    const toolCalls = result.content.filter(part => part.type === 'tool-call');

    expect(
      toolCalls.length <= 1 || warnsThatOptionIsUnsupported(result.warnings),
      'disableParallelToolUse was silently ignored: received multiple tool calls and no warning',
    ).toBe(true);
  });
});
