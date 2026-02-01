import { google } from '@ai-sdk/google';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { saveAudioFile } from '../lib/save-audio';
import { run } from '../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: google.speech('gemini-2.5-flash-preview-tts'),
    text: 'Hola desde el AI SDK!',
    language: 'es', // Spanish using ISO 639 language code
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
