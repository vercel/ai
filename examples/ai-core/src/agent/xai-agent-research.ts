import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const system = `you are an ai research assistant. your goal is to thoroughly research topics and provide comprehensive analysis.
use server-side tools to gather information and validate claims. provide citations for all sources.
break down complex topics into clear summaries.`;

  const { fullStream, usage: usagePromise } = streamText({
    model: xai.responses('grok-4-fast'),
    system,
    tools: {
      web_search: xai.tools.webSearch(),
      x_search: xai.tools.xSearch(),
      code_execution: xai.tools.codeExecution(),
    },
    prompt: 'Research prompt caching in LLMs and explain how it reduces costs',
  });

  const sources = new Set<string>();
  let lastToolName = '';

  console.log('Starting research...\n');

  for await (const event of fullStream) {
    switch (event.type) {
      case 'tool-call':
        lastToolName = event.toolName;
        if (event.providerExecuted) {
          console.log(`[Calling ${event.toolName} on server...]`);
        }
        break;

      case 'tool-result':
        console.log(`[${lastToolName} completed]\n`);
        break;

      case 'text-delta':
        process.stdout.write(event.text);
        break;

      case 'source':
        if (event.sourceType === 'url') {
          sources.add(event.url);
        }
        break;
    }
  }

  console.log('\n\n=== Research Complete ===');
  console.log(`\nSources used (${sources.size}):`);
  Array.from(sources).forEach((url, index) => {
    console.log(`  ${index + 1}. ${url}`);
  });

  const usage = await usagePromise;
  if (usage) {
    console.log('\nToken usage:');
    console.log(`  Prompt: ${usage.inputTokens}`);
    console.log(`  Completion: ${usage.outputTokens}`);
    if (usage.reasoningTokens) {
      console.log(`  Reasoning: ${usage.reasoningTokens}`);
    }
  }
}

main().catch(console.error);
