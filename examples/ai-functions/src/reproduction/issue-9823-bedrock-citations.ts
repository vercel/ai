import 'dotenv/config';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { readFile } from 'node:fs/promises';

async function main() {
  const fixture = JSON.parse(
    await readFile(
      '../../packages/amazon-bedrock/src/__fixtures__/bedrock-citations-content.json',
      'utf8',
    ),
  ) as {
    output: {
      message: {
        content: Array<{
          text?: string;
          citationsContent?: {
            content?: Array<{ text?: string }>;
          };
        }>;
      };
    };
  };

  let requestBody: unknown;

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await generateText({
    model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'According to the attached PDF, what is the AI SDK? Answer in one sentence and cite the document.',
          },
          {
            type: 'file',
            data: new Uint8Array([0, 1, 2, 3]),
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

  const requestedDocument = (
    requestBody as {
      messages?: Array<{
        content?: Array<{
          document?: { citations?: { enabled?: boolean } };
        }>;
      }>;
    }
  ).messages?.[0]?.content?.find(part => part.document != null)?.document;

  if (requestedDocument?.citations?.enabled !== true) {
    throw new Error(
      'ISSUE_9823_INVALID_SETUP: citations were not enabled in the Bedrock request',
    );
  }

  const expectedText = fixture.output.message.content
    .map(
      part =>
        part.text ??
        part.citationsContent?.content
          ?.map(generatedContent => generatedContent.text ?? '')
          .join('') ??
        '',
    )
    .join('');

  console.log(
    JSON.stringify(
      {
        bedrockContent: fixture.output.message.content,
        expectedText,
        aiSdkText: result.text,
      },
      null,
      2,
    ),
  );

  if (result.text !== expectedText) {
    throw new Error(
      'ISSUE_9823_REPRODUCED: AI SDK omitted Bedrock citation text from the generated response',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
