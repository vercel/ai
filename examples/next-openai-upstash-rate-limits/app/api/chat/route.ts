import { openai } from '@ai-sdk/openai';
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';
import { streamText } from 'ai';
import OpenAI from 'openai';

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const ip = req.headers.get('x-forwarded-for');
    const ratelimit = new Ratelimit({
      redis: kv,
      // rate limit to 5 requests per 10 seconds
      limiter: Ratelimit.slidingWindow(5, '10s'),
    });

    const { success, limit, reset, remaining } = await ratelimit.limit(
      `ratelimit_${ip}`,
    );

    if (!success) {
      return new Response('You have reached your request limit for the day.', {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      });
    }
  }

  // Extract the `messages` from the body of the request
  const { messages } = await req.json();

  // Call the language model
  const result = await streamText({
    model: openai('gpt-4o'),
    messages,
    async onFinish({ text, toolCalls, toolResults, usage, finishReason }) {
      // implement your own logic here, e.g. for storing messages
      // or recording token usage
    },
  });

  // Respond with the stream
  return result.toDataStreamResponse();
}
