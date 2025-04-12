import { elevenlabs } from '@ai-sdk/elevenlabs';
import { experimental_changeVoice as changeVoice } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';
import { saveAudioFile } from '../lib/save-audio';

async function main() {
  const result = await changeVoice({
    model: elevenlabs.changer('eleven_multilingual_v2'),
    audio: await readFile('data/galileo.mp3'),
    voice: '21m00Tcm4TlvDq8ikWAM',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);

  await saveAudioFile(result.audio);
}

main().catch(console.error);
