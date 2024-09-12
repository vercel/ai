import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
    prompt:
      'Invent a new fake holiday and describe its traditions. ' +
      'You are a comedian and should insult the audience as much as possible.',

    experimental_providerMetadata: {
      bedrock: {
        guardrailConfig: {
          guardrailIdentifier: '<your-guardrail-identifier>',
          guardrailVersion: '1',
          trace: 'enabled' as const,
          streamProcessingMode: 'async',
        },
      },
    },
  });

  console.log(result.text);
  console.log();
  console.log(
    JSON.stringify(
      result.experimental_providerMetadata?.bedrock.trace,
      null,
      2,
    ),
  );
}

main().catch(console.error);
