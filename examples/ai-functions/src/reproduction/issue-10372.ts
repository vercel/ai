import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output, stepCountIs, tool, type CallWarning } from 'ai';
import { z } from 'zod';

const modelId = 'claude-sonnet-4-5-20250929';
const toolResult = 'TOOL_RESULT: Tokyo is sunny, 23 C';

async function runAiSdk(mode: 'reported' | 'output-format') {
  const warnings: CallWarning[] = [];
  let executions = 0;

  globalThis.AI_SDK_LOG_WARNINGS = value => {
    warnings.push(...(value as CallWarning[]));
  };

  const result = await generateText({
    model: anthropic(modelId),
    tools: {
      getWeather: tool({
        description: 'Get the current weather for a location.',
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }) => {
          executions++;
          return `${toolResult} in ${location}`;
        },
      }),
    },
    experimental_output: Output.object({
      schema: z.object({ weather: z.string() }),
    }),
    prompt:
      'Call getWeather for Tokyo. Then set weather to the exact string returned by the tool.',
    stopWhen: stepCountIs(3),
    prepareStep: ({ stepNumber }) => ({
      toolChoice: stepNumber === 0 ? 'required' : 'none',
    }),
    providerOptions:
      mode === 'output-format'
        ? {
            anthropic: {
              structuredOutputMode: 'outputFormat',
            },
          }
        : undefined,
  });

  const warningDetails = warnings
    .filter(warning => warning.type === 'unsupported-setting')
    .map(warning => `${warning.setting}: ${warning.details ?? ''}`);

  console.log(
    JSON.stringify(
      {
        mode,
        executions,
        output: result.experimental_output,
        warningDetails,
      },
      null,
      2,
    ),
  );

  return { executions, output: result.experimental_output, warningDetails };
}

async function runDirectProvider() {
  const headers = {
    'anthropic-beta': 'structured-outputs-2025-11-13',
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY!,
  };
  const tools = [
    {
      name: 'getWeather',
      description: 'Get the current weather for a location.',
      input_schema: {
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location'],
        additionalProperties: false,
      },
    },
  ];
  const outputConfig = {
    format: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: { weather: { type: 'string' } },
        required: ['weather'],
        additionalProperties: false,
      },
    },
  };

  const firstResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content:
            'Call getWeather for Tokyo. Then set weather to the exact string returned by the tool.',
        },
      ],
      tools,
      tool_choice: { type: 'tool', name: 'getWeather' },
      output_config: outputConfig,
    }),
  });
  const firstBody = (await firstResponse.json()) as {
    content?: Array<{
      type: string;
      id?: string;
      name?: string;
      input?: { location?: string };
    }>;
    error?: { message?: string };
  };

  if (!firstResponse.ok) {
    throw new Error(
      `Direct provider request failed (${firstResponse.status}): ${firstBody.error?.message ?? 'unknown error'}`,
    );
  }

  const call = firstBody.content?.find(
    part => part.type === 'tool_use' && part.name === 'getWeather',
  );
  if (call?.id == null) {
    throw new Error('Direct provider did not call getWeather.');
  }

  const secondResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content:
            'Call getWeather for Tokyo. Then set weather to the exact string returned by the tool.',
        },
        { role: 'assistant', content: firstBody.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: call.id,
              content: `${toolResult} in ${call.input?.location ?? 'Tokyo'}`,
            },
          ],
        },
      ],
      tools,
      tool_choice: { type: 'none' },
      output_config: outputConfig,
    }),
  });
  const secondBody = (await secondResponse.json()) as {
    content?: Array<{ type: string; text?: string }>;
    error?: { message?: string };
  };

  if (!secondResponse.ok) {
    throw new Error(
      `Direct provider request failed (${secondResponse.status}): ${secondBody.error?.message ?? 'unknown error'}`,
    );
  }

  const text = secondBody.content?.find(part => part.type === 'text')?.text;
  console.log(
    JSON.stringify(
      {
        mode: 'direct-provider',
        calledTool: call.name,
        output: text == null ? undefined : JSON.parse(text),
        providerResponses: {
          first: firstBody,
          second: secondBody,
        },
      },
      null,
      2,
    ),
  );
}

async function main() {
  const mode = process.argv[2];

  if (mode === '--direct') {
    await runDirectProvider();
    return;
  }

  if (mode === '--output-format') {
    await runAiSdk('output-format');
    return;
  }

  const result = await runAiSdk('reported');
  const reportedWarning = result.warningDetails.some(details =>
    details.includes(
      'JSON response format does not support tools. The provided tools are ignored.',
    ),
  );

  if (result.executions === 0 && reportedWarning) {
    throw new Error(
      'ISSUE_10372_REPRODUCED: getWeather was ignored when tools and experimental_output were combined.',
    );
  }

  throw new Error(
    `ISSUE_10372_NOT_REPRODUCED: getWeather executions=${result.executions}, reportedWarning=${reportedWarning}.`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
