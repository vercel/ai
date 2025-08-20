import { elevenlabs } from '@ai-sdk/elevenlabs';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import 'dotenv/config';
import { saveAudioFile } from '../lib/save-audio';

async function main() {
  const result = await generateSpeech({
    model: elevenlabs.speech('eleven_multilingual_v2'),
    text: 'This speech has custom voice settings for more expressive output.',
    voice: process.env.ELEVENLABS_VOICE_ID || 'your-voice-id-here',
    providerOptions: {
      elevenlabs: {
        voice_settings: {
          stability: 0.3, // Lower for more variation
          similarity_boost: 0.8, // Higher for closer to original voice
          style: 0.6, // Control speaking style
          use_speaker_boost: true, // Enhance voice clarity
        },
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