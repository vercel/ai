import { openai } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import 'dotenv/config';

async function main() {
  // Read audio file and create data URL
  const audioBuffer = await readFile('data/galileo.mp3');
  const base64Audio = audioBuffer.toString('base64');
  const dataUrl = new URL(`data:audio/mpeg;base64,${base64Audio}`);

  const result = await transcribe({
    model: openai.transcription('whisper-1'),
    audio: dataUrl,
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
}

main().catch(console.error);
