import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';

async function testGenerateText() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-latest'),
    prompt: 'What are the latest breakthroughs in quantum computing? Please search for recent developments.',
    providerOptions: {
      anthropic: {
        webSearch: {
          maxUses: 3,
          allowedDomains: ['arxiv.org', 'nature.com', 'mit.edu'],
        },
      },
    },
  });

  console.log(result.text);
  console.log();
  console.log('Sources:', result.sources.length);
  console.log('Usage:', result.usage);
  console.log();
}

async function testStreamText() {
  const result = streamText({
    model: anthropic('claude-3-5-sonnet-latest'),
    prompt: 'What are current stock market trends? Search for latest financial news.',
    providerOptions: {
      anthropic: {
        webSearch: {
          maxUses: 2,
          blockedDomains: ['reddit.com'],
        },
      },
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Sources:', (await result.sources).length);
  console.log('Usage:', await result.usage);
  console.log();
}

async function main() {
  console.log('Generate Text Test:');
  await testGenerateText();
  
  console.log('Stream Text Test:');
  await testStreamText();
}

main().catch(console.error); 