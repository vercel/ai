import { anthropic } from '../../../../packages/anthropic/dist/index.mjs';
import {
  generateText,
  jsonSchema,
  Output,
  stepCountIs,
  tool,
} from '../../../../packages/ai/dist/index.mjs';

const expectedToolValue = 'issue-10372-tool-result';
const modelId = 'claude-sonnet-4-5-20250929';

const outputSchema = {
  type: 'object',
  properties: {
    weather: { type: 'string' },
  },
  required: ['weather'],
  additionalProperties: false,
} as const;

const weatherToolSchema = {
  type: 'object',
  properties: {
    city: { type: 'string' },
  },
  required: ['city'],
  additionalProperties: false,
} as const;

async function callAnthropic(body: Record<string, unknown>) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.json();

  if (!response.ok) {
    throw new Error(
      `Direct Anthropic request failed with ${response.status}: ${JSON.stringify(responseBody)}`,
    );
  }

  return responseBody as {
    content: Array<Record<string, unknown>>;
    stop_reason: string;
  };
}

async function main() {
  let toolExecutions = 0;

  const result = await generateText({
    model: anthropic(modelId),
    system:
      'You must call getWeather before answering. Copy the tool result exactly into the final weather field.',
    prompt: 'What is the weather in Tokyo?',
    tools: {
      getWeather: tool({
        description: 'Get the weather for a city.',
        inputSchema: jsonSchema<{ city: string }>(weatherToolSchema),
        execute: async () => {
          toolExecutions += 1;
          return expectedToolValue;
        },
      }),
    },
    experimental_output: Output.object({
      schema: jsonSchema<{ weather: string }>(outputSchema),
    }),
    stopWhen: stepCountIs(3),
  });

  let outputFormatToolExecutions = 0;
  const outputFormatResult = await generateText({
    model: anthropic(modelId),
    system:
      'You must call getWeather before answering. Copy the tool result exactly into the final weather field.',
    prompt: 'What is the weather in Tokyo?',
    tools: {
      getWeather: tool({
        description: 'Get the weather for a city.',
        inputSchema: jsonSchema<{ city: string }>(weatherToolSchema),
        execute: async () => {
          outputFormatToolExecutions += 1;
          return expectedToolValue;
        },
      }),
    },
    experimental_output: Output.object({
      schema: jsonSchema<{ weather: string }>(outputSchema),
    }),
    providerOptions: {
      anthropic: {
        structuredOutputMode: 'outputFormat',
      },
    },
    stopWhen: stepCountIs(3),
  });

  const directRequest = {
    model: modelId,
    max_tokens: 256,
    system:
      'Call getWeather before answering. After receiving its result, copy it exactly into the JSON weather field.',
    messages: [
      {
        role: 'user',
        content: 'What is the weather in Tokyo?',
      },
    ],
    tools: [
      {
        name: 'getWeather',
        description: 'Get the weather for a city.',
        input_schema: weatherToolSchema,
      },
    ],
    tool_choice: {
      type: 'tool',
      name: 'getWeather',
      disable_parallel_tool_use: true,
    },
    output_config: {
      format: {
        type: 'json_schema',
        schema: outputSchema,
      },
    },
  };

  const directToolResponse = await callAnthropic(directRequest);
  const directToolCall = directToolResponse.content.find(
    part => part.type === 'tool_use' && part.name === 'getWeather',
  );

  if (directToolCall == null || typeof directToolCall.id !== 'string') {
    throw new Error(
      `Direct Anthropic request did not call getWeather: ${JSON.stringify(directToolResponse)}`,
    );
  }

  const directOutputResponse = await callAnthropic({
    ...directRequest,
    messages: [
      directRequest.messages[0],
      {
        role: 'assistant',
        content: directToolResponse.content,
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: directToolCall.id,
            content: expectedToolValue,
          },
        ],
      },
    ],
    tool_choice: { type: 'none' },
  });
  const directOutputText = directOutputResponse.content.find(
    part => part.type === 'text',
  )?.text;
  const directOutput =
    typeof directOutputText === 'string'
      ? JSON.parse(directOutputText)
      : undefined;

  console.log(
    JSON.stringify(
      {
        aiSdk: {
          toolExecutions,
          output: result.experimental_output,
          warnings: result.warnings,
        },
        aiSdkOutputFormatComparison: {
          toolExecutions: outputFormatToolExecutions,
          output: outputFormatResult.experimental_output,
          warnings: outputFormatResult.warnings,
        },
        directAnthropic: {
          toolCallName: directToolCall.name,
          output: directOutput,
        },
      },
      null,
      2,
    ),
  );

  if (
    toolExecutions !== 1 ||
    result.experimental_output.weather !== expectedToolValue
  ) {
    throw new Error(
      `ISSUE_10372_REPRODUCED: expected getWeather to execute once and provide "${expectedToolValue}" to the structured output`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
