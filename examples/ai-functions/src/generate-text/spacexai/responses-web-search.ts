import { spacexai } from '@ai-sdk/spacexai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: spacexai.responses('grok-4-fast-non-reasoning'),
    tools: {
      web_search: spacexai.tools.webSearch(),
    },
    prompt:
      'What are the latest developments in AI from the past week? Search and summarize.',
  });

  console.log('Text:', result.text);
  console.log();
  console.log('Tool calls made:');
  for (const content of result.content) {
    if (content.type === 'tool-call') {
      console.log(
        `  - ${content.toolName} (${content.providerExecuted ? 'server-side' : 'client-side'})`,
      );
    }
  }

  console.log();
  console.log('Sources cited:');
  for (const content of result.content) {
    if (content.type === 'source' && content.sourceType === 'url') {
      console.log(`  - ${content.url}`);
    }
  }

  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
});
