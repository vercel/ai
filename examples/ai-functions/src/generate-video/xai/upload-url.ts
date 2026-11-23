import { xai, type XaiVideoModelOptions } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Create a signed HTTPS PUT URL in your storage service. Sign for
  // Content-Type: video/mp4 and allow enough time for generation and upload.
  const uploadUrl = process.env.XAI_VIDEO_UPLOAD_URL;
  if (!uploadUrl) {
    throw new Error('Set XAI_VIDEO_UPLOAD_URL to a signed storage PUT URL.');
  }

  try {
    const result = await generateVideo({
      model: xai.video('grok-imagine-video-1.5'),
      prompt: 'A blue ball rolls across a plain white surface.',
      duration: 5,
      providerOptions: {
        xai: { output: { uploadUrl } } satisfies XaiVideoModelOptions,
      },
    });
    // Upload-only results have no local video bytes. Do not access result.video.
    console.log('Videos delivered by xAI:', result.uploadedVideos);
  } catch {
    // Signed URLs are credentials. Avoid logging requests or provider diagnostics.
    throw new Error(
      'Video delivery failed. Check the destination and URL expiry.',
    );
  }
});
