import { deepgram } from '@ai-sdk/deepgram';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

// Non-English voice: language selects the composed voice suffix
// (aura-2-celeste-es).
run(async () => {
  const result = await generateSpeech({
    model: deepgram.speech('aura-2'),
    voice: 'celeste',
    language: 'es',
    text: '¡Hola! Bienvenido a Deepgram. Esta es una prueba de la API de texto a voz.',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
