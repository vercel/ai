import { google } from '@ai-sdk/google';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';
import { saveAudioFile } from '../../lib/save-audio';

run(async () => {
  const result = await generateSpeech({
    model: google.speech('gemini-3.8-flash-tts'),
    text: 'Welcome back! <short pause> It is good to see you. <laugh>',
    instructions: 'Warm, relaxed, and speaking slowly',
    voice: 'Kore',
  });

  console.log('Warnings:', result.warnings);
  // Gemini 3.8 returns a complete WAV file; do not add another header.
  await saveAudioFile(result.audio);
});
