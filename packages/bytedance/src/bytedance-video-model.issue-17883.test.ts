import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ByteDanceVideoModel } from './bytedance-video-model';

const recordedStatusResponse = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/issue-17883-status-response.json', import.meta.url),
    'utf8',
  ),
);

describe('issue #17883', () => {
  it('surfaces the returned last frame URL in provider metadata', async () => {
    const model = new ByteDanceVideoModel('seedance-1-0-pro-250528', {
      provider: 'bytedance.video',
      baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
      headers: () => ({ Authorization: 'Bearer test-key' }),
      fetch: async () =>
        new Response(JSON.stringify(recordedStatusResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });

    const result = await model.doStatus({
      operation: { taskId: recordedStatusResponse.id },
    });

    expect(result.status).toBe('completed');
    expect(
      result.status === 'completed'
        ? result.providerMetadata?.bytedance
        : undefined,
    ).toMatchObject({
      lastFrameUrl: recordedStatusResponse.content.last_frame_url,
    });
  });
});
