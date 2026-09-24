import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: amazonBedrock('us.anthropic.claude-haiku-4-5-20251001-v1:0'),
    messages: [
      {
        role: 'user',
        content: 'Invent a new holiday and describe its traditions.',
      },
      {
        role: 'assistant',
        content: 'Full Moon Festival',
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
