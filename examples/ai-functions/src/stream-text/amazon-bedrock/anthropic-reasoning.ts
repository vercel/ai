import {
  amazonBedrock,
  type AmazonBedrockLanguageModelChatOptions,
} from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: amazonBedrock('us.anthropic.claude-opus-4-7'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: 'adaptive',
          display: 'summarized',
          maxReasoningEffort: 'high',
        },
      } satisfies AmazonBedrockLanguageModelChatOptions,
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
});
