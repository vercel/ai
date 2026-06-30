import {
  google,
  type GoogleLanguageModelInteractionsOptions,
} from '@ai-sdk/google';
import { streamText, type GeneratedFile } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const videos: Array<GeneratedFile> = [];

  await withSpinner('Generating video...', async () => {
    const result = streamText({
      // Omni-family ids route through the Interactions API automatically, so
      // `google(...)` / `languageModel(...)` work without `google.interactions(...)`.
      model: google('gemini-omni-flash-preview'),
      prompt:
        'A marble rolling fast on a chain reaction style track, continuous smooth shot.',
      providerOptions: {
        google: {
          responseModalities: ['video'],
          // Faster synchronous generation; omit store:false if you need
          // multi-turn editing via previousInteractionId.
          store: false,
        } satisfies GoogleLanguageModelInteractionsOptions,
      },
    });

    for await (const part of result.stream) {
      switch (part.type) {
        case 'text-delta': {
          process.stdout.write(part.text);
          break;
        }
        case 'file': {
          if (part.file.mediaType.startsWith('video/')) {
            videos.push(part.file);
          }
          break;
        }
      }
    }

    console.log();
    console.log(
      'Interaction id:',
      (await result.finalStep).providerMetadata?.google?.interactionId,
    );
  });

  if (videos.length > 0) {
    await presentVideos(videos);
  }
});
