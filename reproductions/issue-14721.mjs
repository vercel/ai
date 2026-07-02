#!/usr/bin/env node
import assert from 'node:assert/strict';
import { experimental_transcribe } from '../packages/ai/dist/index.js';
import { detectMediaType } from '../packages/provider-utils/dist/index.js';

// Minimal ISO-BMFF/M4A header from the issue report:
// bytes 0..15: 00 00 00 1c 66 74 79 70 4d 34 41 20 00 00 02 00
// The "ftyp" brand starts at byte offset 4, after the 4-byte box length.
const m4aBytes = new Uint8Array([
  0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20,
  0x00, 0x00, 0x02, 0x00,
]);

console.log(
  'ftyp at byte 0:',
  m4aBytes[0] === 0x66 &&
    m4aBytes[1] === 0x74 &&
    m4aBytes[2] === 0x79 &&
    m4aBytes[3] === 0x70,
);
console.log(
  'ftyp at byte 4:',
  m4aBytes[4] === 0x66 &&
    m4aBytes[5] === 0x74 &&
    m4aBytes[6] === 0x79 &&
    m4aBytes[7] === 0x70,
);
console.log(
  "detectMediaType({ topLevelType: 'audio' }):",
  detectMediaType({ data: m4aBytes, topLevelType: 'audio' }),
);

let capturedArgs;

await experimental_transcribe({
  model: {
    specificationVersion: 'v4',
    provider: 'issue-14721-repro-provider',
    modelId: 'issue-14721-repro-model',
    async doGenerate(args) {
      capturedArgs = args;
      return {
        text: 'dummy transcript',
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
        warnings: [],
        response: {
          timestamp: new Date(0),
          modelId: 'issue-14721-repro-model',
          headers: {},
        },
        providerMetadata: {},
      };
    },
  },
  audio: new URL('file:///example.m4a'),
  // This simulates a caller/download layer that already knows the file is
  // audio/mp4. The current implementation still sniffs the bytes and ignores
  // this mediaType when calling the transcription model.
  download: async () => ({ data: m4aBytes, mediaType: 'audio/mp4' }),
  maxRetries: 0,
});

console.log('mediaType passed to transcription model:', capturedArgs?.mediaType);

assert.equal(
  capturedArgs?.mediaType,
  'audio/mp4',
  'expected transcribe to preserve/detect audio/mp4 for an M4A/MP4 file with ftyp at byte offset 4',
);
