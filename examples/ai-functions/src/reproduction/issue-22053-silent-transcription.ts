import { createElevenLabs } from '@ai-sdk/elevenlabs';
import {
  experimental_transcribe as transcribe,
  NoTranscriptGeneratedError,
} from 'ai';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function main() {
  const response = await readFile(
    new URL(
      '../../../../packages/elevenlabs/src/__fixtures__/elevenlabs-transcription-silent.json',
      import.meta.url,
    ),
    'utf8',
  );

  try {
    const result = await transcribe({
      model: createElevenLabs({
        apiKey: 'test-api-key',
        fetch: async () => Response.json(JSON.parse(response)),
      }).transcription('scribe_v2'),
      audio: new Uint8Array([1, 2, 3]),
      maxRetries: 0,
    });

    assert.equal(
      result.text,
      '',
      'A successful silent transcription must return an empty transcript.',
    );
  } catch (error) {
    if (NoTranscriptGeneratedError.isInstance(error)) {
      throw new Error(
        'ISSUE_22053: successful silent transcription was rejected with AI_NoTranscriptGeneratedError',
        { cause: error },
      );
    }

    throw error;
  }
}

void main();
