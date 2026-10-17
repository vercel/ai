import { minimax } from '@ai-sdk/minimax';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: minimax.speech('speech-2.8-hd'),
    text: 'The quick brown fox jumps over the lazy dog.',
    providerOptions: {
      minimax: {
        voice_setting: {
          voice_id: 'female-tianmei',
          speed: 1.5,
          vol: 8,
          pitch: 5,
          emotion: 'happy',
          text_normalization: true,
          latex_read: false,
        },
        audio_setting: {
          sample_rate: 24000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
      },
    },
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);

  await saveAudioFile(result.audio);
});
