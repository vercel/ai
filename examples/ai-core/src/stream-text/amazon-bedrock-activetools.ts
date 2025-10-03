import { bedrock } from '@ai-sdk/amazon-bedrock';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: bedrock('anthropic.claude-3-5-sonnet-20241022-v2:0'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({
          result: `The weather in ${city} is 20°C.`,
        }),
      }),
    },
    stopWhen: [stepCountIs(5)],
    prepareStep: ({ stepNumber }) => {
      if (stepNumber > 0) {
        console.log(`Setting activeTools: [] for step ${stepNumber}`);
        return {
          activeTools: [],
        };
      }
      return undefined;
    },
    toolChoice: 'auto',
    prompt: 'What is the weather in Toronto, Calgary, and Vancouver?',
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'start-step':
        console.log('Step started');
        break;
      case 'tool-call':
        console.log(
          `Tool call: ${part.toolName}(${JSON.stringify(part.input)})`,
        );
        break;
      case 'tool-result':
        console.log(`Tool result: ${JSON.stringify(part.output)}`);
        break;
      case 'text-delta':
        process.stdout.write(part.text);
        break;
      case 'finish-step':
        console.log('Step finished');
        break;
      case 'finish':
        console.log('Stream finished');
        break;
    }
  }

  console.log();
  console.log('Usage:', await result.usage);
}

main().catch(console.error);
