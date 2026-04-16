import { alibaba, type AlibabaLanguageModelOptions } from '@ai-sdk/alibaba';
import { stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = streamText({
    model: alibaba('qwen-plus'),
    prompt: 'What is the weather in Paris, Tokyo, and London?',
    stopWhen: stepCountIs(5),
    providerOptions: {
      alibaba: {
        parallelToolCalls: false,
      } satisfies AlibabaLanguageModelOptions,
    },
    tools: {
      getWeather: tool({
        description: 'Get the weather for a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get weather for'),
        }),
        execute: async ({ location }) => {
          console.log(`[Executing] getWeather for ${location}...`);
          await new Promise(resolve => setTimeout(resolve, 500));
          const temps: Record<string, number> = {
            Paris: 18,
            Tokyo: 24,
            London: 15,
          };
          const temp = temps[location] ?? 20;
          return {
            location,
            temperature: temp,
            unit: 'celsius',
            condition: 'sunny',
          };
        },
      }),
    },
  });

  const toolCallOrder: string[] = [];

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'tool-call':
        toolCallOrder.push(part.toolName);
        console.log(`\nTool call: ${part.toolName}`, part.input);
        break;
      case 'tool-result':
        console.log(`Tool result:`, part.output);
        break;
      case 'text-delta':
        process.stdout.write(part.text);
        break;
    }
  }

  console.log('\n\nTool execution order:', toolCallOrder);
  console.log('Usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
