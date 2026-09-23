import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: amazonBedrock('us.anthropic.claude-haiku-4-5-20251001-v1:0'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log('Response headers:', (await result.response).headers);
});
