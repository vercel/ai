import { alibaba } from '@ai-sdk/alibaba';
import { stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = streamText({
    model: alibaba('qwen-plus'),
    prompt: 'What is the weather in Paris and Tokyo?',
    stopWhen: stepCountIs(5),
    tools: {
      getWeather: tool({
        description: 'Get the weather for a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get weather for'),
        }),
        execute: async ({ location }) => {
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

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'tool-call':
        console.log(`\nTool call: ${part.toolName}`);
        console.log(`   Input: ${JSON.stringify(part.input)}`);
        break;
      case 'tool-result':
        console.log(`   Result: ${JSON.stringify(part.output)}`);
        break;
      case 'text-delta':
        process.stdout.write(part.text);
        break;
    }
  }

  console.log('\n\nUsage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log('Steps:', (await result.steps).length);
}

main().catch(console.error);
