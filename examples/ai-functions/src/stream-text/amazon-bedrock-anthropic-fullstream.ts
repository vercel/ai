import { bedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { streamText } from 'ai';
import 'dotenv/config';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: bedrockAnthropic('us.anthropic.claude-3-5-sonnet-20241022-v2:0'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        process.stdout.write(part.text);
        break;
      case 'finish-step':
        console.log('\n\n--- Finish Step ---');
        console.log('Finish reason:', part.finishReason);
        console.log('Usage:', part.usage);
        console.log(
          'Stop sequence:',
          part.providerMetadata?.anthropic?.stopSequence,
        );
        break;
    }
  }
});
