import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const { fullStream } = streamText({
    model: xai.responses('grok-4-fast'),
    tools: {
      web_search: xai.tools.webSearch({
        allowedDomains: ['x.ai'],
        enableImageUnderstanding: true,
      }),
    },
    prompt: 'search x.ai website and describe any images you find on the homepage',
  });

  console.log('searching x.ai with image understanding...\n');

  for await (const part of fullStream) {
    switch (part.type) {
      case 'tool-call':
        if (part.providerExecuted) {
          console.log(`[tool: ${part.toolName}]`);
        }
        break;

      case 'text-delta':
        process.stdout.write(part.text);
        break;

      case 'source':
        if (part.sourceType === 'url') {
          console.log(`\n[source: ${part.url}]`);
        }
        break;
    }
  }

  console.log('\n');
}

main().catch(console.error);
