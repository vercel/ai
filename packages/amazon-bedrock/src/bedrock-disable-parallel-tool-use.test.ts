import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createAmazonBedrock } from './bedrock-provider';

function readFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, `__fixtures__/${name}.json`),
      'utf8',
    ),
  );
}

function hasDisableParallelToolUse(value: unknown): boolean {
  if (value == null || typeof value !== 'object') {
    return false;
  }

  if (
    'disable_parallel_tool_use' in value &&
    value.disable_parallel_tool_use === true
  ) {
    return true;
  }

  return Object.values(value).some(hasDisableParallelToolUse);
}

function createReplayFetch() {
  return async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const requestBody = JSON.parse(String(init?.body));
    const disablesParallelCalls = hasDisableParallelToolUse(requestBody);
    const hasBedrockToolChoice = requestBody.toolConfig?.toolChoice != null;

    if (disablesParallelCalls && hasBedrockToolChoice) {
      return Response.json(readFixture('issue-17267-tool-choice-conflict'), {
        status: 400,
      });
    }

    return Response.json(
      readFixture(
        disablesParallelCalls
          ? 'issue-17267-disable-parallel-tool-use-enabled'
          : 'issue-17267-disable-parallel-tool-use-ignored',
      ),
    );
  };
}

describe('providerOptions.anthropic.disableParallelToolUse', () => {
  it('serializes tool calls or emits an explicit unsupported-option warning', async () => {
    const provider = createAmazonBedrock({
      region: 'us-east-1',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      fetch: createReplayFetch(),
    });
    const model = provider('global.anthropic.claude-sonnet-4-6');
    const options: LanguageModelV3CallOptions = {
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Look up the values of R1 and C1. You must call both lookup tools. Call both tools now in the same response if parallel tool use is allowed.',
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
    };

    const result = await model.doGenerate(options);
    const toolCallCount = result.content.filter(
      part => part.type === 'tool-call',
    ).length;
    const hasUnsupportedOptionWarning = result.warnings.some(
      warning =>
        warning.type === 'unsupported' &&
        `${warning.feature} ${warning.details ?? ''}`.includes(
          'disableParallelToolUse',
        ),
    );

    expect(
      toolCallCount <= 1 || hasUnsupportedOptionWarning,
      'disableParallelToolUse should allow at most one tool call or produce an explicit unsupported-option warning',
    ).toBe(true);
  });
});
