import { googleVertex } from '@ai-sdk/google-vertex';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: googleVertex.speech('chirp-3-hd'),
    text: 'Hello from the AI SDK!',
    // Composed into the Chirp 3: HD voice name `en-US-Chirp3-HD-Kore`.
    voice: 'Kore',
    language: 'en-US',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
