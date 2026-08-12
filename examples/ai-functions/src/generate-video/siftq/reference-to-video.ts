import { siftq, type SiftQVideoModelOptions } from '@ai-sdk/siftq';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner('Generating video...', () =>
    generateVideo({
      model: siftq.video(),
      prompt: 'The character walks through a neon market at night',
      inputReferences: [
        {
          data: 'https://example.com/character.png',
          mediaType: 'image/png',
        },
        {
          data: 'https://example.com/movement.mp4',
          mediaType: 'video/mp4',
        },
      ],
      providerOptions: {
        siftq: {
          referenceAudioUrls: ['https://example.com/voice-reference.wav'],
          resolution: '768P',
          ratio: 'adaptive',
        } satisfies SiftQVideoModelOptions,
      },
    }),
  );

  await presentVideos(videos);
});
