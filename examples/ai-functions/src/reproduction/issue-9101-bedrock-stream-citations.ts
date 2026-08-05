import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { streamText, TypeValidationError } from 'ai';

async function main() {
  const result = streamText({
    model: amazonBedrock('us.anthropic.claude-sonnet-4-20250514-v1:0'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is generative AI? Cite the supplied document.',
          },
          {
            type: 'file',
            data: await readFile(resolve(process.cwd(), 'data/ai.pdf')),
            mediaType: 'application/pdf',
            filename: 'document.pdf',
            providerOptions: {
              bedrock: {
                citations: { enabled: true },
              },
            },
          },
        ],
      },
    ],
  });

  for await (const part of result.fullStream) {
    if (
      part.type === 'error' &&
      TypeValidationError.isInstance(part.error) &&
      JSON.stringify(part.error.value).includes('"citation"')
    ) {
      console.error(
        'ISSUE_9101_REPRODUCED: valid Bedrock citation delta failed AI SDK validation',
      );
      process.exitCode = 1;
      return;
    }
  }

  throw new Error(
    'ISSUE_9101_NOT_REPRODUCED: stream completed without a citation validation error',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
