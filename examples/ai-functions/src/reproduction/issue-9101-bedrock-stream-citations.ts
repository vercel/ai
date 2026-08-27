import { bedrock } from '@ai-sdk/amazon-bedrock';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { streamText, TypeValidationError } from 'ai';

async function main() {
  const result = streamText({
    model: bedrock('us.anthropic.claude-sonnet-4-20250514-v1:0'),
    includeRawChunks: true,
    onError: () => {},
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

  const rawChunks: unknown[] = [];
  let citationDeltaCount = 0;
  let citationValidationErrorCount = 0;

  for await (const part of result.fullStream) {
    if (part.type === 'raw') {
      rawChunks.push(part.rawValue);

      if (
        typeof part.rawValue === 'object' &&
        part.rawValue != null &&
        'contentBlockDelta' in part.rawValue &&
        JSON.stringify(part.rawValue).includes('"citation"')
      ) {
        citationDeltaCount++;
      }
    }

    if (
      part.type === 'error' &&
      TypeValidationError.isInstance(part.error) &&
      JSON.stringify(part.error.value).includes('"citation"')
    ) {
      citationValidationErrorCount++;
    }
  }

  if (process.env.CAPTURE_BEDROCK_FIXTURE === '1') {
    await writeFile(
      resolve(
        process.cwd(),
        '../../packages/amazon-bedrock/src/__fixtures__/issue-9101-bedrock-document-citations.chunks.txt',
      ),
      rawChunks.map(chunk => JSON.stringify(chunk)).join('\n') + '\n',
    );
  }

  if (citationValidationErrorCount > 0) {
    console.error(
      'ISSUE_9101_REPRODUCED: valid Bedrock citation delta failed AI SDK validation',
    );
    process.exitCode = 1;
    return;
  }

  if (citationDeltaCount === 0) {
    throw new Error(
      'ISSUE_9101_INCONCLUSIVE: Bedrock returned no citation deltas',
    );
  }

  console.log(
    `ISSUE_9101_FIXED: accepted ${citationDeltaCount} Bedrock citation deltas without validation errors`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
