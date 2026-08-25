import { createAmazonBedrock } from './amazon-bedrock-provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

type RequestBody = {
  additionalModelRequestFields?: {
    tool_choice?: {
      disable_parallel_tool_use?: boolean;
    };
  };
  toolConfig?: {
    toolChoice?: unknown;
  };
};

function readFixture(name: string): unknown {
  return JSON.parse(
    fs.readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), {
      encoding: 'utf8',
    }),
  );
}

const parallelToolCalls = readFixture('issue-17267-parallel-tool-calls');
const serializedToolCall = readFixture('issue-17267-serialized-tool-call');
const toolChoiceConflict = readFixture('issue-17267-tool-choice-conflict');

async function replayBedrockResponse(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  void input;
  const requestBody = JSON.parse(String(init?.body)) as RequestBody;
  const disablesParallelToolUse =
    requestBody.additionalModelRequestFields?.tool_choice
      ?.disable_parallel_tool_use === true;

  if (disablesParallelToolUse && requestBody.toolConfig?.toolChoice != null) {
    return Response.json(toolChoiceConflict, { status: 400 });
  }

  return Response.json(
    disablesParallelToolUse ? serializedToolCall : parallelToolCalls,
  );
}

describe('disableParallelToolUse', () => {
  it('serializes Anthropic tool calls or warns that the option is unsupported', async () => {
    const model = createAmazonBedrock({
      apiKey: 'test-api-key',
      baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com',
      fetch: replayBedrockResponse,
    })('global.anthropic.claude-sonnet-4-6');

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
          disableParallelToolUse: true,
        },
      },
    });

    const toolCallCount = result.content.filter(
      part => part.type === 'tool-call',
    ).length;
    const hasUnsupportedOptionWarning = JSON.stringify(
      result.warnings,
    ).includes('disableParallelToolUse');

    expect(
      toolCallCount <= 1 || hasUnsupportedOptionWarning,
      'disableParallelToolUse allowed multiple tool calls without an unsupported-option warning',
    ).toBe(true);
  });
});
