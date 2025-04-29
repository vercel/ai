import { createTestServer } from '@ai-sdk/provider-utils/test';
import { SarvamTranscriptionModel } from './sarvam-transcription-model';
import { createSarvam } from './sarvam-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createSarvam({
  apiKey: '',
});
const model = provider.transcription('saarika:v2');

const server = createTestServer({
  'https://api.sarvam.ai/speech-to-text': {},
});

describe('doGenerate', () => {
  it('should extract the transcript text', async () => {
    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mp3',
    });
    console.log(result.text.toLowerCase());
    expect(result.text.toLowerCase()).toBe('hello');
  });
});
