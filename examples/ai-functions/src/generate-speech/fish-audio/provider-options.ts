import {
  fishAudio,
  type FishAudioSpeechModelOptions,
} from '@ai-sdk/fish-audio';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';
import { saveAudioFile } from '../../lib/save-audio';

run(async () => {
  const result = await generateSpeech({
    model: fishAudio.speech('s2.1-pro'),
    text: 'Fish Audio supports opus output, prosody control, and latency tuning.',
    // A public voice from the Fish Audio library. Run `list-voices.ts` in this
    // folder to browse others.
    voice: '933563129e564b19a115bedd57b7406a',
    outputFormat: 'opus',
    speed: 1.1,
    providerOptions: {
      fishAudio: {
        // -1000 selects the automatic opus bitrate.
        opusBitrate: -1000,
        latency: 'balanced',
        volume: -2,
        temperature: 0.6,
        topP: 0.8,
        features: ['quality-guard'],
      } satisfies FishAudioSpeechModelOptions,
    },
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);

  await saveAudioFile(result.audio);
});
