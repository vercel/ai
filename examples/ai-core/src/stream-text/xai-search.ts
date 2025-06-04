import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: xai('grok-3-latest'),
    prompt:
      'What are the latest posts and activities from @nishimiya? Summarize their recent content and interests.',
    providerOptions: {
      xai: {
        searchParameters: {
          mode: 'on',
          returnCitations: true,
          maxSearchResults: 10,
          sources: [
            {
              type: 'x',
              xHandles: ['nishimiya'],
            },
          ],
        },
      },
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Sources:', await result.sources);
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
}

main().catch(console.error);
