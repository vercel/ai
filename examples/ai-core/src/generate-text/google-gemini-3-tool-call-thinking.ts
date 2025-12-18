import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateText({
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

  console.log('Text:', result.text);
  console.log();

  // Display reasoning content
  if (result.reasoning) {
    console.log('Reasoning:');
    for (const reasoning of result.reasoning) {
      console.log('  -', reasoning.text.substring(0, 100) + '...');
      if (reasoning.providerMetadata?.google?.thoughtSignature) {
        const sig = String(reasoning.providerMetadata.google.thoughtSignature);
        console.log('    [Signature]:', sig.substring(0, 50) + '...');
      }
    }
    console.log();
  }

  // Display tool calls
  if (result.toolCalls && result.toolCalls.length > 0) {
    console.log('Tool calls:');
    for (const toolCall of result.toolCalls) {
      if (!toolCall.dynamic) {
        console.log(
          '  -',
          toolCall.toolName,
          ':',
          JSON.stringify(toolCall.input),
        );
        if (toolCall.providerMetadata?.google?.thoughtSignature) {
          const sig = String(toolCall.providerMetadata.google.thoughtSignature);
          console.log('    [Signature]:', sig.substring(0, 50) + '...');
        }
      }
    }
    console.log();
  }

  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
