import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAmazonTranscribe } from './amazon-transcribe-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

const TRANSCRIBE_URL = 'https://transcribe.us-east-1.amazonaws.com/';
const S3_UPLOAD_URL =
  'https://s3.us-east-1.amazonaws.com/input-bucket/test-job.wav';
const TRANSCRIPT_URL =
  'https://s3.us-east-1.amazonaws.com/output-bucket/test-job.json';

const provider = createAmazonTranscribe({
  region: 'us-east-1',
  accessKeyId: 'test-access-key-id',
  secretAccessKey: 'test-secret-access-key',
});
const model = provider.transcription('default');

const providerOptions = {
  amazonTranscribe: {
    inputBucket: 'input-bucket',
    outputBucket: 'output-bucket',
    transcriptionJobName: 'test-job',
    languageCode: 'en-US',
    pollIntervalMillis: 1,
  },
};

const server = createTestServer({
  [S3_UPLOAD_URL]: {},
  [TRANSCRIBE_URL]: {},
  [TRANSCRIPT_URL]: {},
});

// The test server indexes array responses by a GLOBAL call counter, so we use a
// function response with a per-endpoint counter to distinguish the
// StartTranscriptionJob call from the subsequent GetTranscriptionJob polls.
function prepareTranscribeResponses(
  statuses: string[],
  headers?: Record<string, string>,
) {
  let call = 0;
  server.urls[TRANSCRIBE_URL].response = () => {
    const index = call++;
    if (index === 0) {
      return {
        type: 'json-value',
        headers,
        body: {
          TranscriptionJob: {
            TranscriptionJobName: 'test-job',
            TranscriptionJobStatus: 'IN_PROGRESS',
          },
        },
      };
    }

    const status = statuses[Math.min(index - 1, statuses.length - 1)];
    return {
      type: 'json-value',
      headers,
      body: {
        TranscriptionJob: {
          TranscriptionJobName: 'test-job',
          TranscriptionJobStatus: status,
          LanguageCode: 'en-US',
          FailureReason:
            status === 'FAILED' ? 'Invalid media format' : undefined,
          Transcript:
            status === 'COMPLETED'
              ? { TranscriptFileUri: TRANSCRIPT_URL }
              : undefined,
        },
      },
    };
  };
}

function prepareResponses({
  statuses = ['COMPLETED'],
  headers,
}: { statuses?: string[]; headers?: Record<string, string> } = {}) {
  server.urls[S3_UPLOAD_URL].response = {
    type: 'json-value',
    body: {},
  };

  prepareTranscribeResponses(statuses, headers);

  server.urls[TRANSCRIPT_URL].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync('src/__fixtures__/transcript.json', 'utf8'),
    ),
  };
}

describe('doGenerate', () => {
  beforeEach(() => prepareResponses());

  it('uploads the audio to the configured S3 bucket', async () => {
    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions,
    });

    expect(server.calls[0].requestMethod).toBe('PUT');
    expect(server.calls[0].requestUrl).toBe(S3_UPLOAD_URL);
  });

  it('starts a transcription job with the media file URI', async () => {
    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions,
    });

    expect(server.calls[1].requestUrl).toBe(TRANSCRIBE_URL);
    expect(server.calls[1].requestHeaders['x-amz-target']).toBe(
      'Transcribe.StartTranscriptionJob',
    );
    expect(await server.calls[1].requestBodyJson).toMatchObject({
      TranscriptionJobName: 'test-job',
      Media: { MediaFileUri: 's3://input-bucket/test-job.wav' },
      LanguageCode: 'en-US',
      MediaFormat: 'wav',
      OutputBucketName: 'output-bucket',
    });
  });

  it('enables single-language identification when no language is provided', async () => {
    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        amazonTranscribe: {
          inputBucket: 'input-bucket',
          transcriptionJobName: 'test-job',
        },
      },
    });

    const body = await server.calls[1].requestBodyJson;
    expect(body.IdentifyLanguage).toBe(true);
    expect(body.LanguageCode).toBeUndefined();
  });

  it('does not enable language identification when identifyLanguage is false', async () => {
    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        amazonTranscribe: {
          inputBucket: 'input-bucket',
          transcriptionJobName: 'test-job',
          identifyLanguage: false,
        },
      },
    });

    const body = await server.calls[1].requestBodyJson;
    expect(body.IdentifyLanguage).toBeUndefined();
    expect(body.IdentifyMultipleLanguages).toBeUndefined();
    expect(body.LanguageCode).toBeUndefined();
  });

  it('polls until the job completes and downloads the transcript', async () => {
    prepareResponses({ statuses: ['IN_PROGRESS', 'IN_PROGRESS', 'COMPLETED'] });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions,
    });

    // PUT, Start, Get x3 (2x IN_PROGRESS + 1x COMPLETED), transcript GET
    expect(server.calls[2].requestHeaders['x-amz-target']).toBe(
      'Transcribe.GetTranscriptionJob',
    );
    expect(server.calls.at(-1)?.requestUrl).toBe(TRANSCRIPT_URL);
    expect(result.text).toBe('Hello from the AI SDK.');
  });

  it('extracts the transcription text, segments and language', async () => {
    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions,
    });

    expect(result.text).toBe('Hello from the AI SDK.');
    expect(result.language).toBe('en-US');
    expect(result.durationInSeconds).toBe(1.85);
    expect(result.segments).toEqual([
      {
        text: 'Hello from the AI SDK.',
        startSecond: 0,
        endSecond: 1.85,
      },
    ]);
  });

  it('throws when the transcription job fails', async () => {
    prepareResponses({ statuses: ['FAILED'] });

    await expect(
      model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions,
      }),
    ).rejects.toThrow('Invalid media format');
  });

  it('signs requests with a SigV4 authorization header', async () => {
    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions,
    });

    expect(server.calls[0].requestHeaders['authorization']).toContain(
      'AWS4-HMAC-SHA256',
    );
    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/amazon-transcribe/0.0.0-test',
    );
  });
});

describe('provider', () => {
  it('throws for unsupported model types', () => {
    expect(() => provider.languageModel('x')).toThrowError();
    expect(() => provider.imageModel('x')).toThrowError();
  });
});
