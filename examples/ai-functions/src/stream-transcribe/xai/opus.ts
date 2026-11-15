import { createXai, type XaiProviderSettings } from '@ai-sdk/xai';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { run } from '../../lib/run';

const xai = createXai({
  webSocket: WebSocket as unknown as XaiProviderSettings['webSocket'],
});

/*
 * Ogg pages use lacing values to delimit packets. xAI expects one raw Opus
 * packet per WebSocket frame, without the Ogg container or its two headers.
 */
function extractOpusPackets({ ogg }: { ogg: Uint8Array }): Uint8Array[] {
  const packets: Uint8Array[] = [];
  const segments: Uint8Array[] = [];
  let offset = 0;

  while (offset < ogg.length) {
    const page = ogg.subarray(offset);
    if (
      page.length < 27 ||
      page[0] !== 0x4f ||
      page[1] !== 0x67 ||
      page[2] !== 0x67 ||
      page[3] !== 0x53
    ) {
      throw new Error('Invalid Ogg page.');
    }

    const segmentCount = page[26];
    const lengths = page.subarray(27, 27 + segmentCount);
    if (lengths.length !== segmentCount) {
      throw new Error('Incomplete Ogg page header.');
    }

    let dataOffset = offset + 27 + segmentCount;
    for (const length of lengths) {
      const segment = ogg.subarray(dataOffset, dataOffset + length);
      if (segment.length !== length) {
        throw new Error('Incomplete Ogg page data.');
      }

      segments.push(segment);
      dataOffset += length;
      if (length < 255) {
        packets.push(Buffer.concat(segments));
        segments.length = 0;
      }
    }

    offset = dataOffset;
  }

  const decoder = new TextDecoder();
  if (
    segments.length !== 0 ||
    decoder.decode(packets[0]?.subarray(0, 8)) !== 'OpusHead' ||
    decoder.decode(packets[1]?.subarray(0, 8)) !== 'OpusTags'
  ) {
    throw new Error('Invalid Ogg Opus file.');
  }

  return packets.slice(2);
}

run(async () => {
  const packets = extractOpusPackets({
    ogg: await readFile('data/galileo-opus.ogg'),
  });
  let nextPacket = 0;
  const audio = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (nextPacket === packets.length) {
        controller.close();
        return;
      }

      controller.enqueue(packets[nextPacket++]);
      await delay(20);
    },
  });

  const result = streamTranscribe({
    model: xai.transcription('grok-voice-transcribe-2.0'),
    audio,
    inputAudioFormat: { type: 'audio/opus', rate: 48000 },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'transcript-final') {
      console.log('Final:', part.text);
    }
  }

  console.log('Text:', await result.text);
  console.log('Warnings:', await result.warnings);
});
