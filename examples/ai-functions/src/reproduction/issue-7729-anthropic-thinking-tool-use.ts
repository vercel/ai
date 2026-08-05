import { createAnthropic } from '@ai-sdk/anthropic';
import { isStepCount, smoothStream, streamText, tool } from 'ai';
import { z } from 'zod';

type RequestBody = {
  model?: string;
  messages?: Array<{
    role?: string;
    content?: Array<{
      type?: string;
      signature?: string;
    }>;
  }>;
};

async function runScenario({
  name,
  transform,
}: {
  name: string;
  transform?: ReturnType<typeof smoothStream>;
}) {
  const requestBodies: RequestBody[] = [];
  const provider = createAnthropic({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBodies.push(JSON.parse(init.body));
      }
      return fetch(input, init);
    },
  });

  const result = streamText({
    model: provider(
      process.env.ISSUE_7729_MODEL ?? 'claude-sonnet-4-5-20250929',
    ),
    prompt:
      'Call getWeather exactly once for San Francisco. After the tool returns, answer briefly using its result.',
    maxOutputTokens: 256,
    maxRetries: 0,
    stopWhen: isStepCount(2),
    tools: {
      getWeather: tool({
        description: 'Get the current weather for a city.',
        inputSchema: z.object({
          city: z.string(),
        }),
        execute: async ({ city }) => ({
          city,
          temperatureFahrenheit: 72,
          condition: 'sunny',
        }),
      }),
    },
    prepareStep: async ({ messages }) =>
      messages.length > 20 ? { messages: messages.slice(-10) } : {},
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: 1024,
        },
      },
    },
    ...(transform == null ? {} : { experimental_transform: transform }),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      throw part.error;
    }
  }

  const secondRequest = requestBodies[1];
  const assistantMessage = secondRequest?.messages
    ?.slice()
    .reverse()
    .find(message => message.role === 'assistant');
  const assistantContent = assistantMessage?.content ?? [];
  const thinkingBlock = assistantContent.find(
    part => part.type === 'thinking' || part.type === 'redacted_thinking',
  );
  const toolUseIndex = assistantContent.findIndex(
    part => part.type === 'tool_use',
  );
  const thinkingIndex = assistantContent.findIndex(
    part => part.type === 'thinking' || part.type === 'redacted_thinking',
  );
  const finalText = await result.text;
  const steps = await result.steps;

  const observed = {
    name,
    model: secondRequest?.model,
    requestCount: requestBodies.length,
    stepCount: steps.length,
    assistantContentTypes: assistantContent.map(part => part.type),
    thinkingPrecedesToolUse:
      thinkingIndex !== -1 &&
      toolUseIndex !== -1 &&
      thinkingIndex < toolUseIndex,
    thinkingMetadataPreserved:
      thinkingBlock?.type === 'redacted_thinking' ||
      (thinkingBlock?.type === 'thinking' &&
        typeof thinkingBlock.signature === 'string' &&
        thinkingBlock.signature.length > 0),
    finalText,
  };

  console.log(JSON.stringify(observed, null, 2));

  if (requestBodies.length !== 2) {
    throw new Error(
      `Expected two Anthropic requests for tool execution, received ${requestBodies.length}.`,
    );
  }

  if (!observed.thinkingPrecedesToolUse) {
    throw new Error(
      'Issue #7729 reproduced: the second Anthropic request did not place a thinking block before tool_use.',
    );
  }

  if (!observed.thinkingMetadataPreserved) {
    throw new Error(
      'Issue #7729 reproduced: the thinking block signature or redacted data was not preserved for the second Anthropic request.',
    );
  }

  if (steps.length !== 2 || finalText.length === 0) {
    throw new Error(
      'Issue #7729 reproduced: Anthropic did not complete the second request after tool execution.',
    );
  }
}

async function main() {
  await runScenario({ name: 'untransformed stream' });
  await runScenario({
    name: 'built-in smoothStream',
    transform: smoothStream({ delayInMs: null }),
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
