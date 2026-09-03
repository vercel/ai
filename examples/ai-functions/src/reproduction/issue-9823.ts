import { createAmazonBedrock } from '../../../../packages/amazon-bedrock/src/index';
import fs from 'node:fs';

const expectedText =
  "Generative artificial intelligence refers to models that predict and generate various types of outputs (such as text, images, or audio) based on what's statistically likely, pulling from patterns they've learned from their training data.";

async function main() {
  const fixture = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../../packages/amazon-bedrock/src/__fixtures__/bedrock-citations-content-only.1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    fetch: async () =>
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  const result = await bedrock(
    'us.anthropic.claude-sonnet-4-20250514-v1:0',
  ).doGenerate({
    prompt: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Return the first sentence from the document and nothing else.',
          },
          {
            type: 'file',
            data: Buffer.from('%PDF-1.4\n').toString('base64'),
            mediaType: 'application/pdf',
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

  const sdkText = result.content
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');

  if (sdkText === '') {
    console.error(
      'ISSUE_9823_REPRODUCED: Bedrock citations response mapped to empty text',
    );
    process.exitCode = 1;
    return;
  }

  if (!sdkText.includes(expectedText)) {
    throw new Error(
      `Bedrock citations response was incomplete: ${JSON.stringify(sdkText)}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
