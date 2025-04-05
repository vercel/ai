import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-4o-mini'),
    prompt: 'What happened in San Francisco last week?',
    tools: {
      web_search_preview: openai.tools.webSearchPreview(),
    },
  });

  for (let i = 0; i < result.text.length; i++) {
    const isCited = result.citations.some(
      citation => i >= citation.startIndex && i < citation.endIndex,
    );

    process.stdout.write(
      isCited ? `\x1b[36m${result.text[i]}\x1b[0m` : result.text[i],
    );
  }

  console.log();
  console.log();
  console.log('Sources:');
  console.log(result.sources);
  console.log('Citations:');
  console.log(result.citations);
}

main().catch(console.error);
