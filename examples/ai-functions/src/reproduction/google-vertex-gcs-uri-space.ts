import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';

const inputUri = 'gs://my-bucket/folder/My File.pdf';
const encodedUri = 'gs://my-bucket/folder/My%20File.pdf';

type VertexRequest = {
  contents?: Array<{
    parts?: Array<{
      fileData?: {
        fileUri?: string;
      };
    }>;
  }>;
};

async function main() {
  let observedFileUri: string | undefined;

  const vertex = createGoogleVertex({
    apiKey: 'reproduction-api-key',
    fetch: async (_input, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected Vertex request body to be JSON text.');
      }

      const request = JSON.parse(init.body) as VertexRequest;
      observedFileUri = request.contents?.[0]?.parts?.find(
        part => part.fileData != null,
      )?.fileData?.fileUri;

      if (observedFileUri !== inputUri) {
        throw new Error(
          `ISSUE #21265 REPRODUCED: expected Vertex fileUri "${inputUri}" byte-identically, but the request contained "${observedFileUri}".`,
        );
      }

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'The file URI was preserved.' }],
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
          status: 200,
          headers: { 'content-type': 'application/json' },
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

  if (observedFileUri !== inputUri) {
    throw new Error(
      `Expected "${inputUri}", but observed "${observedFileUri ?? encodedUri}".`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
