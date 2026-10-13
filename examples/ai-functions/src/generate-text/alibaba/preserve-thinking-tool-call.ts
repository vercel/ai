import { alibaba, type AlibabaLanguageModelChatOptions } from '@ai-sdk/alibaba';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

// When thinking is enabled, the reasoning that leads to a tool call is sent
// back as `reasoning_content` alongside the tool results, as Alibaba
// recommends for function calling with thinking mode.
run(async () => {
  const result = await generateText({
    model: alibaba('qwen3.7-max'),
    providerOptions: {
      alibaba: {
        enableThinking: true,
        thinkingBudget: 2048,
      } satisfies AlibabaLanguageModelChatOptions,
    },
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => ({
          location,
          temperature: 72,
          condition: 'sunny',
        }),
      }),
    },
    stopWhen: isStepCount(3),
    prompt: 'What is the weather in San Francisco? Use the weather tool.',
  });

  for (const [index, step] of result.steps.entries()) {
    console.log(`Step ${index + 1} reasoning:`, step.reasoningText);
    console.log(`Step ${index + 1} text:`, step.text);
  }
  console.log('Tool calls made:', result.toolCalls.length);
  console.log('Final answer:', result.text);
  console.log('Usage:', result.usage);
});
