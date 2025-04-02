import { openai } from '@ai-sdk/openai';
import { experimental_generateTranscript as generateTranscript } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';

async function main() {
  const { transcript } = await generateTranscript({
    model: openai.transcription('whisper-1'),
    audio: await readFile('audio.mp3'),
  });

  console.log(transcript);
}

main().catch(console.error);
