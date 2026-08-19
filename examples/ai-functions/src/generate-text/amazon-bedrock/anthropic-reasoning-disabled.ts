import {
  amazonBedrock,
  type AmazonBedrockLanguageModelChatOptions,
} from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Models with adaptive thinking turn thinking on by default, so `disabled`
  // has to reach the API for the request to run without reasoning tokens.
  const result = await generateText({
    model: amazonBedrock('us.anthropic.claude-sonnet-5'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      bedrock: {
        reasoningConfig: { type: 'disabled' },
      } satisfies AmazonBedrockLanguageModelChatOptions,
    },
  });

  console.log('Request body:');
  console.log(JSON.stringify(result.request?.body, null, 2));
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Usage:');
  console.log(result.usage);
});
