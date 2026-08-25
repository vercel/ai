import type { LanguageModelV2CallWarning } from '@ai-sdk/provider';
import fs from 'node:fs';
import { BedrockChatLanguageModel } from '../../../../packages/amazon-bedrock/src/bedrock-chat-language-model';

const fixtureDirectory = new URL(
  '../../../../packages/amazon-bedrock/src/__fixtures__/',
  import.meta.url,
);

function readFixture(name: string) {
  return JSON.parse(
    fs.readFileSync(new URL(`${name}.json`, fixtureDirectory), 'utf8'),
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

async function main() {
  const model = new BedrockChatLanguageModel(
    'global.anthropic.claude-sonnet-4-6',
    {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      generateId: () => 'reproduction-id',
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
    prompt: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Look up the values of R1 and C1. You may call both tools in the same step.',
          },
        ],
      },
    ],
    tools: [
      {
        type: 'function',
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
        type: 'function',
        name: 'get_capacitor_value',
        description: 'Look up a capacitor value',
        inputSchema: {
          type: 'object',
          properties: { ref: { type: 'string' } },
          required: ['ref'],
          additionalProperties: false,
        },
      },
    ],
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
  const warned = warnsThatOptionIsUnsupported(result.warnings);

  if (toolCalls.length > 1 && !warned) {
    console.error(
      `disableParallelToolUse was silently ignored: received ${toolCalls.length} tool calls and no warning`,
    );
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
