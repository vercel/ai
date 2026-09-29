import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: amazonBedrock('us.anthropic.claude-haiku-4-5-20251001-v1:0'),
    providerOptions: {
      bedrock: {
        guardrailConfig: {
          guardrailIdentifier: '<your-guardrail-identifier>',
          guardrailVersion: '1',
          trace: 'enabled' as const,
        },
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'London is the capital of UK. Tokyo is the capital of Japan.',
            providerOptions: {
              bedrock: {
                guardContent: true,
                guardContentQualifiers: ['grounding_source'],
              },
            },
          },
          {
            type: 'text',
            text: 'Some additional background information.',
          },
          {
            type: 'text',
            text: 'What is the capital of Japan?',
            providerOptions: {
              bedrock: {
                guardContent: true,
                guardContentQualifiers: ['query'],
              },
            },
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log(JSON.stringify(result.providerMetadata?.bedrock.trace, null, 2));
});
