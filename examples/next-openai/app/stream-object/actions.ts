'use server';

import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import { createStreamableValue } from 'ai/rsc';
import { PartialNotification, notificationSchema } from './schema';

export async function generateNotifications(context: string) {
  const notificationsStream = createStreamableValue<PartialNotification>();

  streamObject({
    model: openai('gpt-4-turbo'),
    prompt: `Generate 3 notifications for a messages app in this context: ${context}`,
    schema: notificationSchema,
  })
    .then(async ({ partialObjectStream }) => {
      for await (const partialObject of partialObjectStream) {
        notificationsStream.update(partialObject);
      }
    })
    .finally(() => {
      notificationsStream.done();
    });

  return notificationsStream.value;
}
