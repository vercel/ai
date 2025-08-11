import { fal } from '@ai-sdk/fal';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import 'dotenv/config';
import { saveAudioFile } from '../lib/save-audio';

async function main() {
  const result = await generateSpeech({
    model: fal.speech('fal-ai/minimax/voice-design'),
    text: '',
    providerOptions: {
      fal: {
        prompt:
          'Bubbly and excitable female pop star interviewee, youthful, slightly breathless, and very enthusiastic',
        preview_text:
          "Oh my gosh, hi. It's like so amazing to be here. This new endpoint just dropped on fal and the results have been like totally incredible. Use it now, It's gonna be like epic!",
      },
    },
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
}

main().catch(console.error);
