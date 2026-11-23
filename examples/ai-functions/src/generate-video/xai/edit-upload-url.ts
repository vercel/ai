import { xai, type XaiVideoModelOptions } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const uploadUrl = process.env.XAI_VIDEO_UPLOAD_URL;
  const videoUrl = process.env.XAI_SOURCE_VIDEO_URL;
  if (!uploadUrl || !videoUrl) {
    throw new Error('Set XAI_VIDEO_UPLOAD_URL and XAI_SOURCE_VIDEO_URL.');
  }

  try {
    const result = await generateVideo({
      model: xai.video('grok-imagine-video-1.5'),
      prompt: 'Make the scene look like a watercolor painting.',
      providerOptions: {
        xai: {
          mode: 'edit-video',
          videoUrl,
          output: { uploadUrl },
        } satisfies XaiVideoModelOptions,
      },
    });
    console.log('Edited videos delivered by xAI:', result.uploadedVideos);
  } catch {
    throw new Error(
      'Video delivery failed. Check the source, destination and URL expiry.',
    );
  }
});
