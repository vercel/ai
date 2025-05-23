import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: google('gemini-2.0-flash-001', { urlContext: true }),
    prompt: `Based on the document: https://ai.google.dev/gemini-api/docs/url-context#limitations.
            Answer this question: How many links we can consume in one request?`,
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
