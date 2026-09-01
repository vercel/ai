import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: amazonBedrock('us.anthropic.claude-haiku-4-5-20251001-v1:0'),
    prompt:
      'Invent a new fake holiday and describe its traditions. ' +
      'You are a comedian and should insult the audience as much as possible.',

    providerOptions: {
      amazonBedrock: {
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
    JSON.stringify(result.finalStep.providerMetadata?.bedrock.trace, null, 2),
  );
});
