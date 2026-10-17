import { minimax } from '@ai-sdk/minimax';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: minimax.speech('speech-2.8-hd'),
    text: 'Hello from the AI SDK!',
    providerOptions: {
      minimax: {
        voice_setting: {
          voice_id: 'female-tianmei',
          speed: 1.0,
          vol: 1,
          pitch: 0,
          emotion: 'calm',
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
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
