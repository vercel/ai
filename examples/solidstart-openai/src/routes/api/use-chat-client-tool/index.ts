import { openai } from '@ai-sdk/openai';
import { convertToCoreMessages, streamText } from 'ai';
import { z } from 'zod';

import { APIEvent } from 'solid-start/api';

export async function POST(event: APIEvent) {
  const { messages } = await event.request.json();

  const result = await streamText({
    model: openai('gpt-4o'),
    messages: convertToCoreMessages(messages),
    tools: {
      restartEngine: {
        description:
          'Restarts the engine. Always ask for confirmation before using this tool.',
        parameters: z.object({}),
        execute: async () => 'Engine restarted.',
      },
      askForConfirmation: {
        description: 'Ask the user for confirmation.',
        parameters: z.object({
          message: z.string().describe('The message to ask for confirmation.'),
        }),
      },
    },
  });

  return result.toAIStreamResponse();
}
