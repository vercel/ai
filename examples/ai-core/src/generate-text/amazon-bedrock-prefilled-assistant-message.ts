import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: bedrock(
      `arn:aws:bedrock:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:inference-profile/us.anthropic.claude-3-5-sonnet-20240620-v1:0`,
    ),
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
}

main().catch(console.error);
