import { xai, type XaiSpeechModelOptions } from '@ai-sdk/xai';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

// xAI's `with_timestamps` option returns character-level alignment and
// duration metadata alongside the audio. The audio is delivered as usual;
// the timing data is exposed via `providerMetadata.xai`.
run(async () => {
  const result = await generateSpeech({
    model: xai.speech(),
    text: 'Hello world.',
    voice: 'eve',
    language: 'en',
    providerOptions: {
      xai: {
        withTimestamps: true,
      } satisfies XaiSpeechModelOptions,
    },
  });

  console.log('Warnings:', result.warnings);
  console.log('Provider Metadata:', result.providerMetadata);

  const timestamps = result.providerMetadata.xai?.audioTimestamps as
    | { graphChars: string[]; graphTimes: [number, number][] }
    | undefined;
  if (timestamps) {
    console.log('\nCharacter timings:');
    timestamps.graphChars.forEach((char, i) => {
      const [start, end] = timestamps.graphTimes[i];
      console.log(
        `  ${JSON.stringify(char).padStart(5)}  ${start.toFixed(2)}s - ${end.toFixed(2)}s`,
      );
    });
  }

  await saveAudioFile(result.audio);
});
