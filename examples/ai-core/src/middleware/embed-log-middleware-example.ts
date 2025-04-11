import { openai } from '@ai-sdk/openai';
import { embed, wrapEmbeddingModel } from 'ai';
import 'dotenv/config';
import { yourEmbedLogMiddleware } from './your-embed-log-middleware';

async function main() {
  const result = await embed({
    model: wrapEmbeddingModel({
      model: openai.embedding('text-embedding-3-small'),
      middleware: yourEmbedLogMiddleware,
    }),
    value: 'sunny day at the beach',
  });
}

main().catch(console.error);
