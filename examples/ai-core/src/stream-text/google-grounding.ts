import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: google('gemini-2.0-flash-exp', { useSearchGrounding: true }),
    prompt: 'List the top 5 San Francisco news from the past week.',
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.textDelta);
    }

    if (part.type === 'source' && part.source.sourceType === 'url') {
      console.log('\x1b[36m%s\x1b[0m', 'Source');
      console.log('ID:', part.source.id);
      console.log('Title:', part.source.title);
      console.log('URL:', part.source.url);
      console.log();
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
