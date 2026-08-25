import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const fixtureDirectory = resolve(
  process.cwd(),
  '../../packages/amazon-bedrock/src/__fixtures__',
);

function readFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(resolve(fixtureDirectory, `${name}.json`), 'utf8'),
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

    if (process.env.ISSUE_17267_SIMULATE_WIRE_FIX === '1') {
      requestBody.additionalModelRequestFields = {
        tool_choice: {
          type: 'auto',
          disable_parallel_tool_use: true,
        },
      };
      delete requestBody.toolConfig.toolChoice;
    }

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

async function main() {
  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    fetch: createReplayFetch(),
  });

  const result = await generateText({
    model: bedrock('global.anthropic.claude-sonnet-4-6'),
    tools: {
      get_resistor_value: tool({
        description: 'Look up a resistor value',
        inputSchema: z.object({ ref: z.string() }),
      }),
      get_capacitor_value: tool({
        description: 'Look up a capacitor value',
        inputSchema: z.object({ ref: z.string() }),
      }),
    },
    prompt:
      'Look up the values of R1 and C1. You must call both lookup tools. Call both tools now in the same response if parallel tool use is allowed.',
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 4000 },
        sendReasoning: true,
        disableParallelToolUse: true,
      },
    },
  });

  const firstStepToolCallCount = result.steps[0]?.toolCalls.length ?? 0;
  const warnings = result.warnings ?? [];
  const hasUnsupportedOptionWarning = warnings.some(
    warning =>
      warning.type === 'unsupported' &&
      `${warning.feature} ${warning.details ?? ''}`.includes(
        'disableParallelToolUse',
      ),
  );

  console.log(
    JSON.stringify({
      firstStepToolCallCount,
      hasUnsupportedOptionWarning,
      warnings,
    }),
  );

  if (firstStepToolCallCount > 1 && !hasUnsupportedOptionWarning) {
    throw new Error(
      'ISSUE_17267_REPRODUCED: disableParallelToolUse allowed multiple tool calls and emitted no unsupported-option warning',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
