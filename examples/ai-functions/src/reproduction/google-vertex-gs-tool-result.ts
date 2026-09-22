import { createVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import assert from 'node:assert/strict';

const gsUrl = 'gs://example-bucket/renditions/hero.png';

async function main() {
  const requests: unknown[] = [];

  const capturingFetch: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));

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
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  };

  const vertex = createVertex({
    project: 'example-project',
    location: 'us-central1',
    apiKey: 'fake',
    fetch: capturingFetch,
  });

  await generateText({
    model: vertex('gemini-3.8-flash'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe it.' },
          {
            type: 'file',
            data: new URL(gsUrl),
            mediaType: 'image/png',
          },
        ],
      },
    ],
  });

  assert.deepEqual(
    (requests.at(-1) as any).contents.at(-1).parts.at(-1),
    {
      fileData: {
        mimeType: 'image/png',
        fileUri: gsUrl,
      },
    },
    'the control user-message file must be forwarded as fileData',
  );

  requests.length = 0;

  try {
    await generateText({
      model: vertex('gemini-3.8-flash'),
      messages: [
        {
          role: 'user',
          content: 'Look at the hero image and describe it.',
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_1',
              toolName: 'view_files',
              input: { media_ids: ['m1'] },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'view_files',
              output: {
                type: 'content',
                value: [
                  { type: 'text', text: 'hero.png activated' },
                  {
                    type: 'file',
                    data: { type: 'url', url: new URL(gsUrl) },
                    mediaType: 'image/png',
                  },
                ],
              },
            },
          ],
        },
      ],
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AI_DownloadError' &&
      error.message.includes('URL scheme must be http, https, or data, got gs:')
    ) {
      assert.equal(
        requests.length,
        0,
        'the Vertex request must not be dispatched after the download error',
      );
      throw new Error(
        'ISSUE #21275 REPRODUCED: provider-supported gs:// tool-result URL throws AI_DownloadError before Vertex request dispatch',
      );
    }

    throw error;
  }

  assert.equal(requests.length, 1, 'the tool-result request must reach Vertex');
  assert.deepEqual(
    (requests[0] as any).contents.at(-1).parts.at(-1),
    {
      functionResponse: {
        name: 'view_files',
        response: {
          name: 'view_files',
          content: 'hero.png activated',
        },
        parts: [
          {
            fileData: {
              mimeType: 'image/png',
              fileUri: gsUrl,
            },
          },
        ],
      },
    },
    'the gs:// tool-result file must be forwarded in functionResponse.parts',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
