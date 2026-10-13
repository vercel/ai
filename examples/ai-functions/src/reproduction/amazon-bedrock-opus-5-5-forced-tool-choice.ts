import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';

type CaseResult = {
  name: string;
  statusCode?: number;
  message?: string;
  requestToolChoice?: unknown;
};

const weatherTool = tool({
  description: 'Get the weather for a city',
  inputSchema: z.object({ city: z.string() }),
});

async function main() {
  let lastRequestToolChoice: unknown;

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body) as {
          toolConfig?: { toolChoice?: unknown };
        };
        lastRequestToolChoice = body.toolConfig?.toolChoice;
      }

      return fetch(input, init);
    },
  });

  const failures: CaseResult[] = [];

  async function runCase(name: string, operation: () => Promise<void>) {
    lastRequestToolChoice = undefined;

    try {
      await operation();
      console.log(`${name}: passed`);
    } catch (error) {
      const failure = error as {
        statusCode?: number;
        message?: string;
        responseBody?: string;
      };
      const result = {
        name,
        statusCode: failure.statusCode,
        message: failure.responseBody ?? failure.message,
        requestToolChoice: lastRequestToolChoice,
      };
      failures.push(result);
      console.error(`${name}: ${JSON.stringify(result)}`);
    }
  }

  await runCase('control generate us auto', async () => {
    const result = await generateText({
      model: bedrock('us.anthropic.claude-opus-5-5'),
      tools: { weather: weatherTool },
      toolChoice: 'auto',
      prompt:
        'You must call the weather tool to answer: What is the weather in Paris?',
    });

    if (result.toolCalls[0]?.toolName !== 'weather') {
      throw new Error('Expected the auto-choice weather tool call.');
    }
    if (JSON.stringify(lastRequestToolChoice) !== '{"auto":{}}') {
      throw new Error(
        `Expected auto tool choice in the request, received ${JSON.stringify(lastRequestToolChoice)}.`,
      );
    }
  });

  await runCase('generate us required', async () => {
    const result = await generateText({
      model: bedrock('us.anthropic.claude-opus-5-5'),
      tools: { weather: weatherTool },
      toolChoice: 'required',
      prompt:
        'You must call the weather tool to answer: What is the weather in Paris?',
    });

    if (result.toolCalls[0]?.toolName !== 'weather') {
      throw new Error('Expected a weather tool call.');
    }
    if (
      !result.warnings?.some(
        warning =>
          warning.type === 'unsupported' && warning.feature === 'toolChoice',
      )
    ) {
      throw new Error('Expected an unsupported toolChoice warning.');
    }
  });

  await runCase('generate us named', async () => {
    const result = await generateText({
      model: bedrock('us.anthropic.claude-opus-5-5'),
      tools: { weather: weatherTool },
      toolChoice: { type: 'tool', toolName: 'weather' },
      prompt:
        'You must call the weather tool to answer: What is the weather in Paris?',
    });

    if (result.toolCalls[0]?.toolName !== 'weather') {
      throw new Error('Expected the named weather tool call.');
    }
    if (
      !result.warnings?.some(
        warning =>
          warning.type === 'unsupported' && warning.feature === 'toolChoice',
      )
    ) {
      throw new Error('Expected an unsupported toolChoice warning.');
    }
  });

  await runCase('generate global required', async () => {
    const result = await generateText({
      model: bedrock('global.anthropic.claude-opus-5-5'),
      tools: { weather: weatherTool },
      toolChoice: 'required',
      prompt:
        'You must call the weather tool to answer: What is the weather in Paris?',
    });

    if (result.toolCalls[0]?.toolName !== 'weather') {
      throw new Error('Expected a weather tool call.');
    }
    if (
      !result.warnings?.some(
        warning =>
          warning.type === 'unsupported' && warning.feature === 'toolChoice',
      )
    ) {
      throw new Error('Expected an unsupported toolChoice warning.');
    }
  });

  await runCase('stream us required', async () => {
    let streamError: unknown;
    const result = streamText({
      model: bedrock('us.anthropic.claude-opus-5-5'),
      tools: { weather: weatherTool },
      toolChoice: 'required',
      prompt:
        'You must call the weather tool to answer: What is the weather in Paris?',
      onError: ({ error }) => {
        streamError = error;
      },
    });
    let toolCall;
    let warnings;

    try {
      [toolCall, warnings] = await Promise.all([
        result.toolCalls.then(toolCalls => toolCalls[0]),
        result.warnings,
      ]);
    } catch (error) {
      throw streamError ?? error;
    }

    if (toolCall?.toolName !== 'weather') {
      throw new Error('Expected a streamed weather tool call.');
    }
    if (
      !warnings?.some(
        warning =>
          warning.type === 'unsupported' && warning.feature === 'toolChoice',
      )
    ) {
      throw new Error('Expected an unsupported toolChoice warning.');
    }
  });

  if (
    failures.some(
      failure =>
        failure.statusCode === 400 &&
        failure.message?.includes(
          'tool_choice: type \\"tool\\" and \\"any\\" are not supported for this model',
        ),
    )
  ) {
    throw new Error(
      'ISSUE_21364_REPRODUCED: Bedrock rejected forced tool_choice for Claude Opus 5.5 with HTTP 400.',
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Unexpected reproduction failure: ${JSON.stringify(failures)}`,
    );
  }

  console.log(
    'Claude Opus 5.5 forced tool choices fell back to auto with warnings.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
