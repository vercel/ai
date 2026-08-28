import { readFile } from 'node:fs/promises';
import { createByteDance } from '@ai-sdk/bytedance';
import { experimental_generateVideo as generateVideo } from 'ai';

async function main() {
  const statusResponse = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/bytedance/src/__fixtures__/issue-17883-status-response.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );

  let createRequestBody: Record<string, unknown> | undefined;

  const bytedance = createByteDance({
    apiKey: 'test-key',
    baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
    fetch: async (_url, init) => {
      if (init?.method === 'POST') {
        createRequestBody = JSON.parse(init.body as string);
        return Response.json({ id: statusResponse.id });
      }

      return Response.json(statusResponse);
    },
  });

  const result = await generateVideo({
    model: bytedance.video('seedance-1-0-pro-250528'),
    prompt: 'A small red ball rolls slowly across a plain white floor.',
    duration: 2,
    providerOptions: {
      bytedance: {
        returnLastFrame: true,
      },
    },
    download: async () => ({
      data: new Uint8Array([0, 0, 0, 0]),
      mediaType: 'video/mp4',
    }),
  });

  if (createRequestBody?.return_last_frame !== true) {
    throw new Error(
      'ISSUE_17883_SETUP_FAILED: return_last_frame was not sent as true',
    );
  }

  const expectedLastFrameUrl = statusResponse.content.last_frame_url;
  if (typeof expectedLastFrameUrl !== 'string') {
    throw new Error(
      'ISSUE_17883_SETUP_FAILED: live-response fixture has no last_frame_url',
    );
  }

  const metadata = result.providerMetadata.bytedance as
    | Record<string, unknown>
    | undefined;
  const actualLastFrameUrl = metadata?.lastFrameUrl;

  if (actualLastFrameUrl !== expectedLastFrameUrl) {
    throw new Error(
      `ISSUE_17883_REPRODUCED: expected providerMetadata.bytedance.lastFrameUrl to equal ${expectedLastFrameUrl}, received ${String(actualLastFrameUrl)}`,
    );
  }

  console.log(
    'ISSUE_17883_FIXED: providerMetadata.bytedance.lastFrameUrl is available',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
