import { openai } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import 'dotenv/config';

async function main() {
  // Read audio file and convert to base64
  const audioBuffer = await readFile('data/galileo.mp3');
  const base64Audio = audioBuffer.toString('base64');

  const result = await transcribe({
    model: openai.transcription('whisper-1'),
    audio: base64Audio,
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
}

main().catch(console.error);
