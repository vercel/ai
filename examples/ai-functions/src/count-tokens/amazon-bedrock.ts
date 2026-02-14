import { bedrock } from '@ai-sdk/amazon-bedrock';
import { countTokens } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await countTokens({
    model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
    messages: [
      {
        role: 'user',
        content: 'What are the benefits of serverless computing?',
      },
    ],
  });

  console.log('Token count:', result.tokens);
  console.log('Warnings:', result.warnings);
});
