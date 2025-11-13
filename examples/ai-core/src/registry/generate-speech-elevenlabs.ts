import { experimental_generateSpeech as generateSpeech } from 'ai';
import 'dotenv/config';
import { registry } from './setup-registry';

async function main() {
  const { audio } = await generateSpeech({
    model: registry.speechModel('elevenlabs:eleven_multilingual_v2'),
    text: 'Hello, this is a test of ElevenLabs speech synthesis using the provider registry!',
    voice: process.env.ELEVENLABS_VOICE_ID || 'your-voice-id-here',
  });

  console.log('Generated audio:', audio);
}

main().catch(console.error);
