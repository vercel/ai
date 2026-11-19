import { deepgram } from '@ai-sdk/deepgram';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

// Flux TTS in another language: the language selects the composed voice
// suffix (flux-carmen-es).
run(async () => {
  const result = await generateSpeech({
    model: deepgram.speech('flux'),
    voice: 'carmen',
    language: 'es',
    text: '¡Hola! Bienvenido a Deepgram. Esta es una prueba de Flux de texto a voz.',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
