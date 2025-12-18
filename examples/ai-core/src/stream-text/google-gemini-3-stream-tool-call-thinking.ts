import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamText({
    model: google('gemini-3-flash-preview'),
    prompt: 'What is the weather in Tokyo? Use the get_weather tool.',
    tools: {
      get_weather: {
        description: 'Get the current weather for a location',
        inputSchema: z.object({
          location: z.string().describe('The city name'),
        }),
      },
    },
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: 'high',
        },
      },
    },
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        process.stdout.write(chunk.text);
        break;
      case 'reasoning-delta':
        if (chunk.providerMetadata?.google?.thoughtSignature) {
          const sig = String(chunk.providerMetadata.google.thoughtSignature);
          console.log('\n[Reasoning signature]:', sig.substring(0, 50) + '...');
        }
        break;
      case 'tool-call':
        console.log('\nTool call:', chunk.toolName, chunk.input);
        if (chunk.providerMetadata?.google?.thoughtSignature) {
          const sig = String(chunk.providerMetadata.google.thoughtSignature);
          console.log('[Tool signature]:', sig.substring(0, 50) + '...');
        }
        break;
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
