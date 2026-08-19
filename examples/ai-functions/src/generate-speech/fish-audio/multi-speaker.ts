import {
  fishAudio,
  type FishAudioSpeechModelOptions,
} from '@ai-sdk/fish-audio';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';
import { saveAudioFile } from '../../lib/save-audio';

// Multi-speaker dialogue is supported on the S2-Pro family. Pass an array of
// voice model IDs via `providerOptions.fishAudio.referenceId` and mark turns in
// the text with `<|speaker:N|>`, where N indexes into that array.
//
// These are public voices from the Fish Audio library. Run `list-voices.ts` in
// this folder to browse others.
const SPEAKER_A = '933563129e564b19a115bedd57b7406a'; // Sarah
const SPEAKER_B = 'bf322df2096a46f18c579d0baa36f41d'; // Adrian

run(async () => {
  const result = await generateSpeech({
    model: fishAudio.speech('s2-pro'),
    text: '<|speaker:0|>Hello! Are you the new voice model?<|speaker:1|>I am. Nice to meet you.',
    providerOptions: {
      fishAudio: {
        referenceId: [SPEAKER_A, SPEAKER_B],
      } satisfies FishAudioSpeechModelOptions,
    },
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);

  await saveAudioFile(result.audio);
});
