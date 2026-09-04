import { expect, it } from 'vitest';
import { start } from 'workflow/api';
import { videoGenerationWorkflow } from './test/video-generation-workflow.js';

it('suspends on a webhook and returns provider video URLs', async () => {
  const run = await start(videoGenerationWorkflow);

  await expect(run.returnValue).resolves.toMatchObject({
    status: 'completed',
    videos: [
      {
        type: 'url',
        url: 'https://example.com/video.mp4',
        mediaType: 'video/mp4',
      },
    ],
    warnings: [{ type: 'other', message: 'start warning' }],
  });
  await expect(run.status).resolves.toBe('completed');
});
