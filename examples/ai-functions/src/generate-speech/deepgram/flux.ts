import { deepgram } from '@ai-sdk/deepgram';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

// Flux TTS: the 'flux' family composes the upstream voice model from the
// voice and language options (flux-haley-en).
run(async () => {
  const result = await generateSpeech({
    model: deepgram.speech('flux'),
    voice: 'haley',
    text: 'Hello, welcome to Deepgram! This is a test of Flux text to speech.',
    providerOptions: {
      deepgram: { expressivity: 1 },
    },
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
