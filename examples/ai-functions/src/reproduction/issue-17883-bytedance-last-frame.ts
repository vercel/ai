import { readFileSync } from 'node:fs';
import { createByteDance } from '@ai-sdk/bytedance';
import { experimental_generateVideo as generateVideo } from 'ai';

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/bytedance/src/__fixtures__/issue-17883-status-response.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  id: string;
  content: {
    last_frame_url: string;
  };
};

async function main() {
  let createRequestBody: Record<string, unknown> | undefined;

  const bytedance = createByteDance({
    apiKey: 'test-key',
    fetch: async (_input, init) => {
      if (init?.method === 'POST') {
        createRequestBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ id: fixture.id }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await generateVideo({
    model: bytedance.video('seedance-1-0-pro-250528'),
    prompt: 'A solid blue circle on a white background.',
    providerOptions: {
      bytedance: {
        returnLastFrame: true,
      },
    },
    poll: {
      intervalMs: 1,
      timeoutMs: 1000,
      delay: async () => {},
    },
    maxRetries: 0,
    download: async () => ({
      data: new Uint8Array([0]),
      mediaType: 'video/mp4',
    }),
  });

  if (createRequestBody?.return_last_frame !== true) {
    throw new Error(
      'Reproduction precondition failed: return_last_frame was not true.',
    );
  }

  const bytedanceMetadata = result.providerMetadata.bytedance;
  const lastFrameUrl =
    bytedanceMetadata != null && typeof bytedanceMetadata === 'object'
      ? bytedanceMetadata.lastFrameUrl
      : undefined;

  if (lastFrameUrl !== fixture.content.last_frame_url) {
    throw new Error(
      'ISSUE_17883_REPRODUCED: ModelArk returned content.last_frame_url but generateVideo omitted providerMetadata.bytedance.lastFrameUrl',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
