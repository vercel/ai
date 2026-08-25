import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, tool } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';

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
    fs.readFileSync(
      new URL(
        `../../../../packages/amazon-bedrock/src/__fixtures__/${name}.json`,
        import.meta.url,
      ),
      { encoding: 'utf8' },
    ),
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

async function main() {
  const bedrock = createAmazonBedrock({
    apiKey: 'test-api-key',
    baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    fetch: replayBedrockResponse,
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
      'Look up the values of R1 and C1. You may call both tools in the same step.',
    providerOptions: {
      anthropic: {
        disableParallelToolUse: true,
      },
    },
    maxRetries: 0,
  });

  const firstStepToolCallCount = result.steps[0]?.toolCalls.length ?? 0;
  const hasUnsupportedOptionWarning = JSON.stringify(result.warnings).includes(
    'disableParallelToolUse',
  );

  if (firstStepToolCallCount > 1 && !hasUnsupportedOptionWarning) {
    throw new Error(
      `Issue #17267 reproduced: disableParallelToolUse produced ${firstStepToolCallCount} tool calls without an unsupported-option warning.`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
