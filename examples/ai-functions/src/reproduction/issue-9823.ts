import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type BedrockResponse = {
  output?: {
    message?: {
      content?: Array<{
        text?: string;
        citationsContent?: {
          content?: Array<{ text?: string }>;
          citations?: unknown[];
        };
      }>;
    };
  };
};

async function main() {
  const providerResponse = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        '../../packages/amazon-bedrock/src/__fixtures__/anthropic-citations-content.json',
      ),
      'utf8',
    ),
  ) as BedrockResponse;
  let requestBody: any;

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(providerResponse), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await generateText({
    model: bedrock('us.anthropic.claude-sonnet-4-20250514-v1:0'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is the title of this document? Return only the cited title with no other words.',
          },
          {
            type: 'file',
            data: Buffer.from('AI'),
            mediaType: 'text/plain',
            filename: 'ai.txt',
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

  const citationText =
    providerResponse?.output?.message?.content
      ?.flatMap(part => part.citationsContent?.content ?? [])
      .map(part => part.text ?? '')
      .join('') ?? '';

  console.log(
    JSON.stringify(
      {
        requestCitations: requestBody.messages[0].content[1].document.citations,
        providerCitationText: citationText,
        aiSdkText: result.text,
      },
      null,
      2,
    ),
  );

  if (requestBody.messages[0].content[1].document.citations?.enabled !== true) {
    throw new Error('Reproduction request did not enable Bedrock citations.');
  }

  if (citationText.length === 0) {
    throw new Error(
      'Live Bedrock response did not contain citation-generated text.',
    );
  }

  if (!result.text.includes(citationText)) {
    throw new Error(
      'ISSUE_9823: Bedrock citation text is missing from the AI SDK response',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
