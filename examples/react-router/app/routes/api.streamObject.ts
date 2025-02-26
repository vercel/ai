import { streamObject, type DeepPartial, type UIMessage } from 'ai';
import { z } from 'zod';
import type { Route } from './+types/api.streamObject';
import { openai } from '@ai-sdk/openai';

// define a schema for the notifications
export const notificationSchema = z.object({
  notifications: z.array(
    z.object({
      name: z.string().describe('Name of a fictional person.'),
      message: z.string().describe('Message. Do not use emojis or links.'),
      minutesAgo: z.number(),
    }),
  ),
});

// define a type for the partial notifications during generation
export type PartialNotification = DeepPartial<typeof notificationSchema>;

export async function action({ request }: Route.ActionArgs) {
  const context = await request.json();
  console.log(context);

  const result = streamObject({
    model: openai('gpt-4o'),
    prompt: `Generate 3 notifications for a messages app in this context: ${context}`,
    schema: notificationSchema,
  });

  return result.toTextStreamResponse();
}
