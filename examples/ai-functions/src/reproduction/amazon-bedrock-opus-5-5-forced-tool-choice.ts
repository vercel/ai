import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError, generateText, streamText, tool } from 'ai';
import { z } from 'zod';

const weatherTool = tool({
  description: 'Get the weather for a city',
  inputSchema: z.object({ city: z.string() }),
});

const timeTool = tool({
  description: 'Get the current time for a city',
  inputSchema: z.object({ city: z.string() }),
});

const tools = {
  weather: weatherTool,
  time: timeTool,
};

function hasToolChoiceWarning(warnings: readonly unknown[] | undefined) {
  return (
    warnings?.some(
      warning =>
        typeof warning === 'object' &&
        warning != null &&
        'feature' in warning &&
        warning.feature === 'toolChoice',
    ) ?? false
  );
}

function assertToolCall(
  toolCalls: Array<{ toolName: string }>,
  expectedToolName: string,
) {
  assert.ok(
    toolCalls.some(toolCall => toolCall.toolName === expectedToolName),
    `Expected a call to '${expectedToolName}', received: ${toolCalls
      .map(toolCall => toolCall.toolName)
      .join(', ')}`,
  );
}

async function assertGenerateFallback({
  modelId,
  toolChoice,
  prompt,
  expectedToolName,
}: {
  modelId: string;
  toolChoice: 'required' | { type: 'tool'; toolName: 'weather' | 'time' };
  prompt: string;
  expectedToolName: 'weather' | 'time';
}) {
  const result = await generateText({
    model: bedrock(modelId),
    maxRetries: 0,
    tools,
    toolChoice,
    prompt,
  });

  assertToolCall(result.toolCalls, expectedToolName);
  assert.ok(
    hasToolChoiceWarning(result.warnings),
    `Expected a toolChoice fallback warning for ${modelId}`,
  );
}

async function assertStreamFallback() {
  let streamError: unknown;
  const result = streamText({
    model: bedrock('us.anthropic.claude-opus-5-5'),
    maxRetries: 0,
    tools,
    toolChoice: 'required',
    prompt: 'Call the weather tool to get the weather in Paris.',
    onError: ({ error }) => {
      streamError = error;
    },
  });

  await result.consumeStream();

  if (streamError != null) {
    throw streamError;
  }

  assertToolCall(await result.toolCalls, 'weather');
  assert.ok(
    hasToolChoiceWarning(await result.warnings),
    'Expected a toolChoice fallback warning for streamText',
  );
}

async function main() {
  const failures: string[] = [];
  const observations: Array<{
    case: string;
    requestToolChoice: unknown;
    responseBody: string | undefined;
  }> = [];
  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'generateText us required',
      run: () =>
        assertGenerateFallback({
          modelId: 'us.anthropic.claude-opus-5-5',
          toolChoice: 'required',
          prompt: 'Call the weather tool to get the weather in Paris.',
          expectedToolName: 'weather',
        }),
    },
    {
      name: 'generateText global required',
      run: () =>
        assertGenerateFallback({
          modelId: 'global.anthropic.claude-opus-5-5',
          toolChoice: 'required',
          prompt: 'Call the weather tool to get the weather in Paris.',
          expectedToolName: 'weather',
        }),
    },
    {
      name: 'generateText named weather',
      run: () =>
        assertGenerateFallback({
          modelId: 'us.anthropic.claude-opus-5-5',
          toolChoice: { type: 'tool', toolName: 'weather' },
          prompt: 'Call the weather tool to get the weather in Paris.',
          expectedToolName: 'weather',
        }),
    },
    {
      name: 'streamText us required',
      run: assertStreamFallback,
    },
  ];

  for (const testCase of cases) {
    try {
      await testCase.run();
    } catch (error) {
      if (
        APICallError.isInstance(error) &&
        error.statusCode === 400 &&
        error.responseBody?.includes(
          'tool_choice: type \\"tool\\" and \\"any\\" are not supported for this model.',
        )
      ) {
        failures.push(testCase.name);
        const requestBody = error.requestBodyValues as {
          toolConfig?: { toolChoice?: unknown };
        };
        observations.push({
          case: testCase.name,
          requestToolChoice: requestBody.toolConfig?.toolChoice,
          responseBody: error.responseBody,
        });
        continue;
      }
      throw error;
    }
  }

  if (failures.length > 0) {
    console.error(JSON.stringify(observations, null, 2));
    throw new Error(
      `ISSUE_21364_REPRODUCED: Claude Opus 5.5 rejected forced tool choice with HTTP 400 in: ${failures.join(', ')}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
