import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError, generateText } from 'ai';
import 'dotenv/config';

const modelId = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

const filenames = [
  "John's report.txt",
  'invoice #123.txt',
  'a&b.txt',
  'report,2026.txt',
  'résumé.txt',
  '분기보고서.txt',
  'Report -  Final.txt',
  'a\tb.txt',
  `${'a'.repeat(201)}.txt`,
  '.txt',
];

type TransportTrace = {
  documentName: string | undefined;
  responseBody: string;
  status: number;
};

const traces: TransportTrace[] = [];

const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? 'us-east-1',
  fetch: async (input, init) => {
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as {
            messages?: Array<{
              content?: Array<{ document?: { name?: string } }>;
            }>;
          })
        : undefined;
    const response = await fetch(input, init);

    traces.push({
      documentName: body?.messages?.[0]?.content?.find(
        part => part.document != null,
      )?.document?.name,
      responseBody: await response.clone().text(),
      status: response.status,
    });

    return response;
  },
});

async function send(filename?: string) {
  return generateText({
    model: bedrock(modelId),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What was the revenue? Answer in one short sentence.',
          },
          {
            type: 'file',
            data: new TextEncoder().encode(
              'The quarterly revenue was 42 million.',
            ),
            mediaType: 'text/plain',
            ...(filename == null ? {} : { filename }),
          },
        ],
      },
    ],
    maxOutputTokens: 30,
  });
}

async function main() {
  const control = await send('Johns report.txt');
  console.log(`Valid filename control succeeded: ${control.text}`);

  const unnamedControl = await send();
  const unnamedDocumentName = traces.at(-1)?.documentName;
  if (unnamedDocumentName !== 'document-1') {
    throw new Error(
      `Expected an unnamed file to use document-1, received ${unnamedDocumentName}`,
    );
  }
  console.log(`Unnamed file control succeeded: ${unnamedControl.text}`);

  const rejected: Array<{
    filename: string;
    documentName: string | undefined;
  }> = [];

  for (const filename of filenames) {
    const traceIndex = traces.length;

    try {
      await send(filename);
    } catch (error) {
      const trace = traces[traceIndex];
      if (
        APICallError.isInstance(error) &&
        error.statusCode === 400 &&
        trace?.status === 400 &&
        /ValidationException|document file name|Member must have length/.test(
          `${error.message}\n${trace.responseBody}`,
        )
      ) {
        rejected.push({
          filename,
          documentName: trace.documentName,
        });
        continue;
      }

      throw error;
    }
  }

  if (rejected.length > 0) {
    console.error(JSON.stringify(rejected, null, 2));
    throw new Error(
      `BUG: Amazon Bedrock rejected ${rejected.length}/${filenames.length} uploaded filenames after @ai-sdk/amazon-bedrock forwarded invalid document.name values`,
    );
  }

  console.log('All reported uploaded filenames were accepted.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
