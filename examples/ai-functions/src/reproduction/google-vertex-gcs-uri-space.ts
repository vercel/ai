import { createVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import assert from 'node:assert/strict';

const expectedFileUri = 'gs://my-bucket/folder/My File.pdf';

async function main() {
  let requestBody: {
    contents?: Array<{
      parts?: Array<{ fileData?: { fileUri?: string } }>;
    }>;
  } = {};

  const vertex = createVertex({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { role: 'model', parts: [{ text: 'ok' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2,
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    },
  });

  await generateText({
    model: vertex('gemini-2.5-pro'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What kind of document is this?' },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: expectedFileUri,
          },
        ],
      },
    ],
  });

  const actualFileUri =
    requestBody.contents?.[0]?.parts?.[1]?.fileData?.fileUri;

  assert.equal(
    actualFileUri,
    expectedFileUri,
    `ISSUE_21265: expected outgoing Vertex fileUri to remain "${expectedFileUri}", but received "${actualFileUri}"`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
