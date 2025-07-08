import { experimental_generateSpeech as generateSpeech } from 'ai';
import { registry } from './setup-registry';

async function main() {
  const { audio } = await generateSpeech({
    model: registry.speechModel('openai:tts-1'),
    text: 'Hello, this is a test of speech synthesis using the provider registry!',
  });

  console.log('Generated audio:', audio);
}

main().catch(console.error);
