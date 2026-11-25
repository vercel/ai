import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { streamText, type GeneratedAudioFile, type GeneratedFile } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

// `streamText` yields generic file parts, so adapt audio files for the helper.
function toGeneratedAudioFile(file: GeneratedFile): GeneratedAudioFile {
  if (!file.mediaType.startsWith('audio/')) {
    throw new Error(`Expected audio file, got ${file.mediaType}`);
  }

  return {
    base64: file.base64,
    uint8Array: file.uint8Array,
    mediaType: file.mediaType,
    format:
      file.mediaType === 'audio/mpeg' ? 'mp3' : file.mediaType.split('/')[1]!,
  };
}

run(async () => {
  const result = streamText({
    model: google('lyria-3-clip-preview'),
    prompt:
      'Generate a short upbeat melody with a gentle synth lead and no spoken words.',
    providerOptions: {
      google: {
        responseModalities: ['AUDIO'],
      } satisfies GoogleLanguageModelOptions,
    },
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        process.stdout.write(part.text);
        break;
      }

      case 'file': {
        console.log(`\nReceived file: ${part.file.mediaType}`);

        if (part.file.mediaType.startsWith('audio/')) {
          await saveAudioFile(toGeneratedAudioFile(part.file));
        }

        break;
      }
    }
  }
});
