import { JSONValue } from 'ai';
import { EventSource } from 'eventsource';

type SmeeWebhookData = {
  body: JSONValue;
  headers: JSONValue;
};

/**
 * Creates a public webhook URL via smee.io and returns a promise that
 * resolves when a POST request is received on that URL.
 *
 * Uses smee.io as a free webhook relay: the provider POSTs to the smee URL,
 * and we receive it via an SSE stream — no local server needed.
 *
 * Based on https://github.com/probot/smee-client
 */
export async function createSmeeWebhook(): Promise<{
  url: string;
  received: Promise<SmeeWebhookData>;
}> {
  // Create a new smee.io channel
  const response = await fetch('https://smee.io/new', {
    method: 'HEAD',
    redirect: 'manual',
  });

  const url = response.headers.get('location');
  if (!url) {
    throw new Error('Failed to create smee.io channel');
  }

  // Connect to the SSE stream and resolve when a webhook message arrives
  const events = new EventSource(url);

  const received = new Promise<SmeeWebhookData>((resolve, reject) => {
    events.addEventListener('message', msg => {
      console.log('Received webhook event from smee.io:');
      const { body, ...headers } = JSON.parse(msg.data);
      events.close();
      resolve({ body, headers });
    });
    events.addEventListener('error', () => {
      events.close();
      reject(new Error('smee.io SSE connection error'));
    });
  });

  return { url, received };
}
