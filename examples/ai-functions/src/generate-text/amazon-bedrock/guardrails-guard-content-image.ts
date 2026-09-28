import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: amazonBedrock('us.anthropic.claude-sonnet-5'),
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
            type: 'file',
            mediaType: 'image/png',
            data: fs.readFileSync('./data/comic-cat.png'),
            providerOptions: {
              bedrock: {
                guardContent: true,
              },
            },
          },
          {
            type: 'text',
            text: 'Describe this image.',
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log(JSON.stringify(result.providerMetadata?.bedrock.trace, null, 2));
});
