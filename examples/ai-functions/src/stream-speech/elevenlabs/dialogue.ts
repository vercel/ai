import { elevenLabs } from '@ai-sdk/elevenlabs';
import { experimental_streamSpeech as streamSpeech } from 'ai';
import { mkdir, writeFile } from 'node:fs/promises';
import { run } from '../../lib/run';

const alice = '21m00Tcm4TlvDq8ikWAM';
const bob = 'pNInz6obpgDQGcFmaJgB';

// Each text part names its speaker; a change of voice starts a new turn.
// Parts can arrive in small deltas, as from a language model.
async function* script() {
  const turns = [
    [alice, 'Did you hear we can stream a whole dialogue now? '],
    [bob, 'Over a single socket, with two voices? That is neat. '],
    [alice, 'Three turns, and the audio starts right away.'],
  ] as const;
  for (const [voice, line] of turns) {
    for (const word of line.split(/(?<= )/)) {
      yield { type: 'text' as const, text: word, voice };
    }
  }
}

run(async () => {
  const modelId = process.argv[2] ?? 'eleven_v4';
  const result = streamSpeech({
    model: elevenLabs.speech(modelId),
    text: script(),
    providerOptions: { elevenlabs: { dialogue: { voices: [alice, bob] } } },
  });

  const chunks: Uint8Array[] = [];
  for await (const chunk of result.audioStream) {
    chunks.push(chunk);
  }

  await mkdir('output', { recursive: true });
  await writeFile(`output/dialogue-${Date.now()}.mp3`, Buffer.concat(chunks));
  console.log('audio chunks:', chunks.length);
  console.log('usage:', await result.usage);
});
