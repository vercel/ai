import assert from 'node:assert/strict';
import { generateText } from 'ai';
import { createVertex } from '../../../../packages/google-vertex/src/google-vertex-provider';

const inputUri = 'gs://my-bucket/folder/My File.pdf';

type VertexRequest = {
  contents?: Array<{
    parts?: Array<{
      fileData?: {
        fileUri?: unknown;
      };
    }>;
  }>;
};

async function main() {
  let requestBody: VertexRequest | undefined;

  const vertex = createVertex({
    project: 'test-project',
    location: 'us-central1',
    headers: { Authorization: 'Bearer test-token' },
    fetch: async (_url, options) => {
      if (typeof options?.body !== 'string') {
        throw new Error(
          'Reproduction harness error: request body was not JSON.',
        );
      }

      requestBody = JSON.parse(options.body) as VertexRequest;

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'Request captured.' }],
                role: 'model',
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2,
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
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
            data: inputUri,
          },
        ],
      },
    ],
  });

  const outgoingUri = requestBody?.contents?.[0]?.parts?.find(
    part => part.fileData != null,
  )?.fileData?.fileUri;

  if (typeof outgoingUri !== 'string') {
    throw new Error(
      'Reproduction harness error: outgoing Vertex fileUri was not captured.',
    );
  }

  assert.equal(
    outgoingUri,
    inputUri,
    `Issue #21265 reproduced: outgoing Vertex fileUri changed from "${inputUri}" to "${outgoingUri}".`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
