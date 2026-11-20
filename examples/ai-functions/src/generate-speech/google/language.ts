import { google } from '@ai-sdk/google';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: google.speech('gemini-3.8-flash-tts'),
    text: 'Guten Morgen! Willkommen beim AI SDK.',
    language: 'de-DE',
  });

  console.log('Warnings:', result.warnings);
  await saveAudioFile(result.audio);
});
