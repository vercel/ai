import { openai } from '@ai-sdk/openai';
import { StreamData, streamText } from 'ai';
import 'dotenv/config';
import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.post('/', async function (request, reply) {
  // use stream data (optional):
  const data = new StreamData();
  data.append('initialized call');

  const result = await streamText({
    model: openai('gpt-4o'),
    prompt: 'Invent a new holiday and describe its traditions.',
    onFinish() {
      data.append('call completed');
      data.close();
    },
  });

  // Mark the response as a v1 data stream:
  reply.header('X-Vercel-AI-Data-Stream', 'v1');
  reply.header('Content-Type', 'text/plain; charset=utf-8');

  return reply.send(result.toDataStream({ data }));
});

fastify.listen({ port: 8080 });
