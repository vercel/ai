import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google.interactions('gemini-omni-flash-preview'),
    prompt:
      'Generate a four-second landscape video of a red ball rolling across a white floor.',
    providerOptions: {
      google: {
        responseModalities: ['video'],
        responseFormat: [
          {
            type: 'video',
            aspectRatio: '16:9',
            resolution: '360p',
          },
        ],
      },
    },
  });

  const videos = result.files.filter(file =>
    file.mediaType.startsWith('video/'),
  );
  await presentVideos(videos);
});
