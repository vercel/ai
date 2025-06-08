import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
  model: anthropic('claude-3-5-sonnet-latest'),
    tools: {
        web_search: anthropic.tools.webSearch_20250305({
          max_uses: 5,
          user_location: {
            type: 'approximate',
            city: 'San Francisco',
            region: 'California',
            country: 'US',
            timezone: 'America/Los_Angeles',
          },
          // Optional: restrict to specific domains
          // allowed_domains: ['wikipedia.org', 'docs.anthropic.com'],
          // Optional: block certain domains
          // blocked_domains: ['example.com'],
        }),
      },
    prompt: 'What is the best burrito near the Vercel office in San Francisco?',
    // experimental_transform: smoothStream(),
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta': {
        process.stdout.write(chunk.textDelta);
        break;
      }

      case 'tool-call': {
        console.log(
          `TOOL CALL ${chunk.toolName} ${JSON.stringify(chunk.args)}`,
        );
        break;
      }

      case 'tool-result': {
        console.log(
          `TOOL RESULT ${chunk.toolName} ${JSON.stringify(chunk.result)}`,
        );
        break;
      }

      case 'source': {
        console.log(
          `SOURCE: ${chunk.source.url} - ${chunk.source.title}`,
        );
        break;
      }

      case 'step-finish': {
        console.log();
        console.log();
        console.log('STEP FINISH');
        console.log('Finish reason:', chunk.finishReason);
        console.log('Usage:', chunk.usage);
        console.log();
        break;
      }

      case 'finish': {
        console.log('FINISH');
        console.log('Finish reason:', chunk.finishReason);
        console.log('Usage:', chunk.usage);
        break;
      }

      case 'error':
        console.error('Error:', chunk.error);
        break;
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  
  const finalResult = await result;
  console.log('\nSources:', finalResult.sources);
  console.log('Number of sources:', finalResult.sources.length);
}

main().catch(console.error);
