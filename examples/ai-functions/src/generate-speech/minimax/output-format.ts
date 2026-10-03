import { minimax } from '@ai-sdk/minimax';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const hexResult = await generateSpeech({
    model: minimax.speech('speech-2.8-hd'),
    text: 'This is an example with hex output format.',
    outputFormat: 'hex',
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
      },
    },
  });

  console.log('Hex Audio (string):', typeof hexResult.audio);

  const urlResult = await generateSpeech({
    model: minimax.speech('speech-2.8-hd'),
    text: 'This is an example with URL output format.',
    outputFormat: 'url',
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
      },
    },
  });

  console.log('URL Audio (Uint8Array):', urlResult.audio instanceof Uint8Array);

  await saveAudioFile(hexResult.audio);
});
