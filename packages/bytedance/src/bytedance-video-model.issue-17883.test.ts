import { readFileSync } from 'node:fs';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { ByteDanceVideoModel } from './bytedance-video-model';

const statusResponse = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/issue-17883-status-response.json', import.meta.url),
    'utf8',
  ),
);

describe('issue #17883', () => {
  it('surfaces a requested last frame URL in provider metadata', async () => {
    let createRequestBody: Record<string, unknown> | undefined;

    const fetch: FetchFunction = async (_url, init) => {
      if (init?.method === 'POST') {
        createRequestBody = JSON.parse(init.body as string);
        return Response.json({ id: statusResponse.id });
      }

      return Response.json(statusResponse);
    };

    const model = new ByteDanceVideoModel('seedance-1-0-pro-250528', {
      provider: 'bytedance.video',
      baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
      headers: () => ({ Authorization: 'Bearer test-key' }),
      fetch,
    });

    const result = await model.doGenerate({
      prompt: 'A small red ball rolls slowly across a plain white floor.',
      n: 1,
      image: undefined,
      frameImages: undefined,
      inputReferences: undefined,
      aspectRatio: undefined,
      resolution: undefined,
      duration: 2,
      fps: undefined,
      seed: undefined,
      generateAudio: undefined,
      providerOptions: {
        bytedance: {
          returnLastFrame: true,
        },
      },
    });

    expect(createRequestBody).toMatchObject({
      return_last_frame: true,
    });
    expect(result.providerMetadata?.bytedance).toMatchObject({
      lastFrameUrl: statusResponse.content.last_frame_url,
    });
  });
});
