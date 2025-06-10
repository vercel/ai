import { openai } from '@ai-sdk/openai';
import { generateText, ModelMessage, tool, ToolCallPart } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    tools: {
      weather: tool({
        requiresConfirmation: true,
        description: 'Get the weather in a location',
        parameters: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        // location below is inferred to be a string:
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    prompt: 'What is the weather in San Francisco?',
  });

  console.dir(result.response.messages, { depth: null });
  console.log(result.finishReason);

  // Extract the content object from the last message
  const lastMessage =
    result.response.messages[result.response.messages.length - 1];
  const content =
    lastMessage.role === 'assistant' ? lastMessage.content : undefined;

  // Extract tool call information from the content
  const toolCall = content?.at(-1) as ToolCallPart;

  // Ask user for confirmation
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const confirm = await new Promise<boolean>(resolve => {
    rl.question(
      'Do you want to proceed with this action? (y/n): ',
      (answer: string) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      },
    );
  });

  const messages: ModelMessage[] = [
    ...result.response.messages,
    ...(!confirm
      ? [
          {
            role: 'tool' as const,
            content: [
              {
                ...toolCall,
                type: 'tool-result' as const,
                result:
                  'The user did not accept the invocation of the tool call.',
              },
            ],
          },
        ]
      : []),
  ];
  const result2 = await generateText({
    model: openai('gpt-3.5-turbo'),
    tools: {
      weather: tool({
        requiresConfirmation: true,
        description: 'Get the weather in a location',
        parameters: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        // location below is inferred to be a string:
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    messages,
  });

  console.dir(result2.response.messages, { depth: null });
}

main().catch(console.error);
