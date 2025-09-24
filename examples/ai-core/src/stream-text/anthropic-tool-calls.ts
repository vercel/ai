import { anthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText, TextStreamPart } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

export const weatherTool = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  // location below is inferred to be a string:
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});

const tools = { weatherTool } as const;

const transfrom = () => {
  let thinkingStartTime = 0;
  let hasStartedThinking = false;
  let accumulatedThinkingContent = '';
  return new TransformStream<TextStreamPart<any>, TextStreamPart<any>>({
    transform(chunk, controller) {
      if (chunk.type === 'reasoning-start') {
        controller.enqueue(chunk);
        hasStartedThinking = true;
        thinkingStartTime = performance.now();
      } else if (chunk.type === 'reasoning-delta') {
        accumulatedThinkingContent += chunk.text;
        const newChunk = {
          ...chunk,
          providerMetadata: {
            ...chunk.providerMetadata,
            metadata: {
              ...chunk.providerMetadata?.metadata,
              thinking_millsec: performance.now() - thinkingStartTime,
              thinking_content: accumulatedThinkingContent,
            },
          },
        };
        controller.enqueue(newChunk);
      } else if (chunk.type === 'reasoning-end' && hasStartedThinking) {
        controller.enqueue({
          ...chunk,
          providerMetadata: {
            ...chunk.providerMetadata,
            metadata: {
              ...chunk.providerMetadata?.metadata,
              thinking_millsec: performance.now() - thinkingStartTime,
              thinking_content: accumulatedThinkingContent,
            },
          },
        });
        accumulatedThinkingContent = '';
        hasStartedThinking = false;
        thinkingStartTime = 0;
      } else {
        controller.enqueue(chunk);
      }
    },
  });
};

run(async () => {
  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    messages: [
      { role: 'user', content: 'node' },
      {
        role: 'assistant',
        content:
          'nodejs is a runtime environment for executing JavaScript code outside of a web browser.',
      },
      {
        role: 'user',
        content:
          'what is the weather in Berlinn?',
      },
    ],
    tools: tools,
    providerOptions: {
      anthropic: {
        stream: true,
        thinking: {
          type: 'enabled',
          budgetTokens: 3276,
        },
      },
    },
    stopWhen: stepCountIs(10),
    experimental_transform: transfrom
  });

  for await (const part of result.fullStream) {
    console.log(JSON.stringify(part));
  }

  console.log();
  console.log('Sources:', (await result.sources).length);
  console.log('Usage:', await result.usage);
  console.log();
});
