import { type Experimental_VideoModelV3Webhook } from '@ai-sdk/provider';
import { EventSource } from 'eventsource';

/**
 * Creates a public webhook URL and returns a promise that resolves when a
 * POST request is received on that URL.
 *
 * Currently uses smee.io as a free webhook relay: the provider POSTs to the
 * URL, and we receive it via an SSE stream — no local server needed.
 *
 * Based on https://github.com/probot/smee-client
 */
export async function createWebhook(): Promise<{
  url: string;
  received: Promise<Experimental_VideoModelV3Webhook>;
}> {
  // Create a new smee.io channel
  const response = await fetch('https://smee.io/new', {
    method: 'HEAD',
    redirect: 'manual',
  });

  const url = response.headers.get('location');
  if (!url) {
    throw new Error('Failed to create webhook channel');
  }

  // Connect to the SSE stream and resolve when a webhook message arrives
  const events = new EventSource(url);

  const received = new Promise<Experimental_VideoModelV3Webhook>(
    (resolve, reject) => {
      events.addEventListener('message', msg => {
        console.log('Received webhook event:');
        const { body, ...headers } = JSON.parse(msg.data);
        events.close();
        resolve({ body, headers });
      });
      events.addEventListener('error', () => {
        events.close();
        reject(new Error('Webhook SSE connection error'));
      });
    },
  );

  return { url, received };
}
