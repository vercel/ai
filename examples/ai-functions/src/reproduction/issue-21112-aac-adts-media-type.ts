import assert from 'node:assert/strict';
import { detectMediaType } from '@ai-sdk/provider-utils';
import { generateSpeech, transcribe } from 'ai';
import { MockSpeechModelV4, MockTranscriptionModelV4 } from 'ai/test';

const aacBase64 =
  '//FQQAF//AEYIAf/8VBAAX/8ARggB//xUEABf/wBGCAH//FQQAF//AEYIAc=';
const aacBytes = Buffer.from(aacBase64, 'base64');

function withSecondByte(secondByte: number): Uint8Array {
  const bytes = Uint8Array.from(aacBytes);
  bytes[1] = secondByte;
  return bytes;
}

function withEmptyId3Tag(data: Uint8Array): Uint8Array {
  return Uint8Array.from([
    0x49,
    0x44,
    0x33, // ID3
    0x04,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // empty ID3v2 tag
    ...data,
  ]);
}

async function main() {
  // The embedded FFmpeg-generated fixture contains four complete MPEG-4 ADTS
  // frames. Its first header is ff f1 (MPEG-4, no CRC).
  assert.equal(aacBytes.length, 44);
  assert.deepEqual([...aacBytes.subarray(0, 2)], [0xff, 0xf1]);

  const detectionCases: Array<{
    name: string;
    data: Uint8Array | string;
  }> = [
    { name: 'MPEG-4 ADTS bytes (ff f1)', data: aacBytes },
    { name: 'MPEG-4 ADTS base64 (ff f1)', data: aacBase64 },
    { name: 'MPEG-2 ADTS bytes (ff f9)', data: withSecondByte(0xf9) },
    {
      name: 'MPEG-4 protected ADTS header (ff f0)',
      data: withSecondByte(0xf0),
    },
    {
      name: 'MPEG-2 protected ADTS header (ff f8)',
      data: withSecondByte(0xf8),
    },
    {
      name: 'ID3-tagged MPEG-4 ADTS bytes',
      data: withEmptyId3Tag(aacBytes),
    },
    {
      name: 'ID3-tagged MPEG-4 ADTS base64',
      data: Buffer.from(withEmptyId3Tag(aacBytes)).toString('base64'),
    },
  ];

  const mismatches: string[] = [];

  for (const { name, data } of detectionCases) {
    const actual = detectMediaType({ data, topLevelType: 'audio' });
    if (actual !== 'audio/aac') {
      mismatches.push(`${name}: expected audio/aac, received ${actual}`);
    }
  }

  const speechResult = await generateSpeech({
    model: new MockSpeechModelV4({
      doGenerate: async () => ({
        audio: aacBytes,
        warnings: [],
        response: {
          timestamp: new Date(0),
          modelId: 'synthetic-speech',
        },
      }),
    }),
    text: 'Synthetic example.',
    outputFormat: 'aac',
  });

  if (speechResult.audio.mediaType !== 'audio/aac') {
    mismatches.push(
      `generateSpeech mediaType: expected audio/aac, received ${speechResult.audio.mediaType}`,
    );
  }
  if (speechResult.audio.format !== 'aac') {
    mismatches.push(
      `generateSpeech format: expected aac, received ${speechResult.audio.format}`,
    );
  }
  if (!Buffer.from(speechResult.audio.uint8Array).equals(aacBytes)) {
    mismatches.push('generateSpeech changed the AAC bytes');
  }

  let transcriptionMediaType: string | undefined;
  await transcribe({
    model: new MockTranscriptionModelV4({
      doGenerate: async options => {
        transcriptionMediaType = options.mediaType;
        return {
          text: 'Synthetic transcription.',
          segments: [],
          language: 'en',
          durationInSeconds: 0.05,
          warnings: [],
          response: {
            timestamp: new Date(0),
            modelId: 'synthetic-transcription',
          },
        };
      },
    }),
    audio: aacBytes,
  });

  if (transcriptionMediaType !== 'audio/aac') {
    mismatches.push(
      `transcribe mediaType: expected audio/aac, received ${transcriptionMediaType}`,
    );
  }

  if (mismatches.length > 0) {
    console.error(
      'ISSUE_21112_REPRODUCED: valid ADTS AAC is mislabelled by media detection, speech metadata, or transcription input',
    );
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #21112 is fixed: ADTS AAC is consistently reported as audio/aac.',
  );
}

await main();
