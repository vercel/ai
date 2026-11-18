import { inferenceCoop } from '@ai-sdk/inference-coop';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: inferenceCoop.speech('tinfoil/voxtral-tts'),
    text: 'Hello from the Inference Cooperative!',
    // `voice` is required by the gateway. See the provider documentation for
    // the full speaker list (neutral, casual, and cheerful variants plus
    // ar, de, es, fr, hi, it, nl, and pt voices).
    voice: 'neutral_female',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);

  await saveAudioFile(result.audio);
});
