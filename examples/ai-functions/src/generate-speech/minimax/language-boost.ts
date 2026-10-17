import { minimax } from '@ai-sdk/minimax';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: minimax.speech('speech-2.8-hd'),
    text: 'Hello! This is a test of the language boost feature.',
    providerOptions: {
      minimax: {
        voice_setting: {
          voice_id: 'female-tianmei',
        },
        audio_setting: {
          sample_rate: 24000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
        language_boost: 'English',
      },
    },
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);

  await saveAudioFile(result.audio);
});
