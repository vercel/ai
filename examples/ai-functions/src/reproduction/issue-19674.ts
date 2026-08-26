import { strict as assert } from 'node:assert';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const model = anthropic('claude-sonnet-4-5');
const prompt =
  'You must use tool search to find the deferred weather tool, call it for San Francisco, and report its result.';

function createTools(onWeatherExecute: () => void) {
  return {
    toolSearch: anthropic.tools.toolSearchBm25_20251119(),
    get_weather: tool({
      description: 'Get the current weather for a location.',
      inputSchema: z.object({
        location: z.string(),
      }),
      execute: async ({ location }) => {
        onWeatherExecute();
        return {
          location,
          temperature: 64,
          condition: 'partly cloudy',
        };
      },
      providerOptions: {
        anthropic: { deferLoading: true },
      },
    }),
  };
}

async function verifyGenerateText() {
  let weatherExecutions = 0;
  const result = await generateText({
    model,
    prompt,
    tools: createTools(() => weatherExecutions++),
    stopWhen: stepCountIs(5),
  });

  const toolCalls = result.steps.flatMap(step => step.toolCalls);
  const toolResults = result.steps.flatMap(step => step.toolResults);

  assert.ok(
    toolCalls.some(
      call => call.toolName === 'toolSearch' && call.providerExecuted === true,
    ),
    'generateText did not expose the provider-executed tool search call',
  );
  assert.ok(
    toolResults.some(result => result.toolName === 'toolSearch'),
    'generateText did not expose the provider-executed tool search result',
  );
  assert.ok(
    toolCalls.some(call => call.toolName === 'get_weather'),
    'generateText did not reach the deferred weather tool call',
  );
  assert.ok(
    toolResults.some(result => result.toolName === 'get_weather'),
    'generateText did not produce the deferred weather tool result',
  );
  assert.equal(
    weatherExecutions,
    1,
    'generateText did not execute the deferred weather tool exactly once',
  );
  assert.match(
    result.text,
    /64|partly cloudy/i,
    'generateText did not complete with the deferred tool output',
  );
}

async function verifyStreamText() {
  let weatherExecutions = 0;
  const result = streamText({
    model,
    prompt,
    tools: createTools(() => weatherExecutions++),
    stopWhen: stepCountIs(5),
  });

  const toolCalls: Array<{
    toolName: string;
    providerExecuted?: boolean;
  }> = [];
  const toolResults: Array<{ toolName: string }> = [];
  let text = '';

  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      throw part.error;
    }
    if (part.type === 'tool-call') {
      toolCalls.push(part);
    }
    if (part.type === 'tool-result') {
      toolResults.push(part);
    }
    if (part.type === 'text-delta') {
      text += part.text;
    }
  }

  assert.ok(
    toolCalls.some(
      call => call.toolName === 'toolSearch' && call.providerExecuted === true,
    ),
    'streamText did not expose the provider-executed tool search call',
  );
  assert.ok(
    toolResults.some(result => result.toolName === 'toolSearch'),
    'streamText did not expose the provider-executed tool search result',
  );
  assert.ok(
    toolCalls.some(call => call.toolName === 'get_weather'),
    'streamText did not reach the deferred weather tool call',
  );
  assert.ok(
    toolResults.some(result => result.toolName === 'get_weather'),
    'streamText did not produce the deferred weather tool result',
  );
  assert.equal(
    weatherExecutions,
    1,
    'streamText did not execute the deferred weather tool exactly once',
  );
  assert.match(
    text,
    /64|partly cloudy/i,
    'streamText did not complete with the deferred tool output',
  );
}

async function main() {
  await verifyGenerateText();
  await verifyStreamText();
  console.log(
    'issue-19674 could not be reproduced: generateText and streamText both completed tool search and executed the deferred tool',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
