import { minimax, type MiniMaxVideoModelOptions } from '@ai-sdk/minimax';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// Reference-to-video: keep subjects/style consistent (reference images),
// follow motion (reference video), and condition on audio (reference audio).
// Refer to references by modality + order in the prompt: "Image 1", "Image 2",
// "Video 1", "Audio 1". Reference audio must accompany at least one reference
// image or video, and each reference clip must meet H3's input constraints
// (video/audio: 2-15s; video H.264/H.265, MP4/MOV).
//
// `inputReferences` are routed by media type: images -> reference_image
// (up to 9), videos -> reference_video (up to 3). Reference audio is passed via
// `providerOptions.minimax.referenceAudioUrls` (up to 3).
run(async () => {
  const { video, warnings, providerMetadata } = await withSpinner(
    'Generating MiniMax reference-to-video (image + video + audio refs)...',
    () =>
      generateVideo({
        model: minimax.video('MiniMax-H3'),
        prompt:
          'Image 1 and Image 2 are the two characters. Keep them consistent ' +
          'with their reference images as they chase each other through a ' +
          'sunlit park. Follow the camera motion of Video 1. Cinematic, warm ' +
          'afternoon light.',
        inputReferences: [
          // Reference images (media type auto-detected as image/png).
          fs.readFileSync('data/comic-cat.png'),
          fs.readFileSync('data/comic-dog.png'),
          // Reference video — explicit mediaType so it routes to reference_video.
          {
            data: fs.readFileSync('data/prudence.mp4'),
            mediaType: 'video/mp4',
          },
        ],
        duration: 5,
        aspectRatio: '16:9',
        providerOptions: {
          minimax: {
            // Optional reference audio. Each clip must be 2-15s and reachable
            // by MiniMax (public URL or `mm_file://` handle). Add "sync to
            // Audio 1" to the prompt when you enable it:
            // referenceAudioUrls: ['https://example.com/voice-under-15s.mp3'],
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies MiniMaxVideoModelOptions,
        },
      }),
  );

  console.log('Warnings:', warnings);
  console.log('Provider metadata:', providerMetadata);
  await presentVideos([video]);
});
