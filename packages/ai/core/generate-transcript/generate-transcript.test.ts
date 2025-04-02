import { TranscriptModelV1, TranscriptModelV1CallWarning } from '@ai-sdk/provider';
import { MockTranscriptModelV1 } from '../test/mock-transcript-model-v1';
import { generateTranscript } from './generate-transcript';

const audioData = new Uint8Array([1, 2, 3, 4]); // Sample audio data
const testDate = new Date(2024, 0, 1);

const sampleTranscript = {
  text: "This is a sample transcript.",
  segments: [
    {
      id: "1",
      start: 0,
      end: 2.5,
      text: "This is a",
      speaker: "speaker_1"
    },
    {
      id: "2",
      start: 2.5,
      end: 4.0,
      text: "sample transcript.",
      speaker: "speaker_1"
    }
  ]
};

const createMockResponse = (options: {
  transcript: typeof sampleTranscript;
  warnings?: TranscriptModelV1CallWarning[];
  timestamp?: Date;
  modelId?: string;
  headers?: Record<string, string>;
}) => ({
  transcript: options.transcript,
  warnings: options.warnings ?? [],
  response: {
    timestamp: options.timestamp ?? new Date(),
    modelId: options.modelId ?? 'test-model-id',
    headers: options.headers ?? {},
  },
});

describe('generateTranscript', () => {
  it('should send args to doGenerate', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let capturedArgs!: Parameters<TranscriptModelV1['doGenerate']>[0];

    await generateTranscript({
      model: new MockTranscriptModelV1({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            transcript: sampleTranscript,
          });
        },
      }),
      audio: audioData,
      language: 'en',
      prompt: 'Transcribe this audio',
      providerOptions: { openai: { temperature: 0 } },
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      audio: audioData,
      language: 'en',
      prompt: 'Transcribe this audio',
      providerOptions: { openai: { temperature: 0 } },
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });
  });

  it('should return warnings', async () => {
    const result = await generateTranscript({
      model: new MockTranscriptModelV1({
        doGenerate: async () =>
          createMockResponse({
            transcript: sampleTranscript,
            warnings: [
              {
                type: 'other',
                message: 'Setting is not supported',
              },
            ],
          }),
      }),
      audio: audioData,
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'other',
        message: 'Setting is not supported',
      },
    ]);
  });

  it('should return the transcript', async () => {
    const result = await generateTranscript({
      model: new MockTranscriptModelV1({
        doGenerate: async () =>
          createMockResponse({
            transcript: sampleTranscript,
          }),
      }),
      audio: audioData,
    });

    expect(result.transcript).toStrictEqual(sampleTranscript);
  });

  describe('error handling', () => {
    it('should throw NoTranscriptGeneratedError when no transcript is returned', async () => {
      await expect(
        generateTranscript({
          model: new MockTranscriptModelV1({
            doGenerate: async () =>
              createMockResponse({
                transcript: { text: "", segments: [] },
                timestamp: testDate,
              }),
          }),
          audio: audioData,
        }),
      ).rejects.toMatchObject({
        name: 'AI_NoTranscriptGeneratedError',
        message: 'No transcript generated.',
        responses: [
          {
            timestamp: testDate,
            modelId: expect.any(String),
          },
        ],
      });
    });

    it('should include response headers in error when no transcript generated', async () => {
      await expect(
        generateTranscript({
          model: new MockTranscriptModelV1({
            doGenerate: async () =>
              createMockResponse({
                transcript: { text: "", segments: [] },
                timestamp: testDate,
                headers: {
                  'custom-response-header': 'response-header-value',
                },
              }),
          }),
          audio: audioData,
        }),
      ).rejects.toMatchObject({
        name: 'AI_NoTranscriptGeneratedError',
        message: 'No transcript generated.',
        responses: [
          {
            timestamp: testDate,
            modelId: expect.any(String),
            headers: {
              'custom-response-header': 'response-header-value',
            },
          },
        ],
      });
    });
  });

  it('should return response metadata', async () => {
    const testHeaders = { 'x-test': 'value' };

    const result = await generateTranscript({
      model: new MockTranscriptModelV1({
        doGenerate: async () =>
          createMockResponse({
            transcript: sampleTranscript,
            timestamp: testDate,
            modelId: 'test-model',
            headers: testHeaders,
          }),
      }),
      audio: audioData,
    });

    expect(result.responses).toStrictEqual([
      {
        timestamp: testDate,
        modelId: 'test-model',
        headers: testHeaders,
      },
    ]);
  });
});
