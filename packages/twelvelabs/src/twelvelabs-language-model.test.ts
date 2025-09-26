import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TwelveLabsLanguageModel } from './twelvelabs-language-model';
import { NoContentGeneratedError } from '@ai-sdk/provider';
import { mapTwelveLabsError } from './twelvelabs-error';

vi.mock('./twelvelabs-error', () => ({
  mapTwelveLabsError: vi.fn().mockImplementation(error => error),
}));

vi.mock('./convert-to-twelvelabs-prompt', () => ({
  convertToTwelveLabsPrompt: vi.fn(),
}));

describe('TwelveLabsLanguageModel', () => {
  let mockClient: any;
  let model: TwelveLabsLanguageModel;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      analyze: vi.fn().mockResolvedValue({
        data: 'This is the analysis result',
      }),
      analyzeStream: vi.fn().mockImplementation(async function* () {
        yield { text: 'Streaming ' };
        yield { text: 'result ' };
        yield { text: 'text' };
      }),
      tasks: {
        create: vi.fn().mockResolvedValue({ id: 'task-123' }),
        waitForDone: vi.fn().mockResolvedValue({ videoId: 'video-456' }),
      },
    };

    model = new TwelveLabsLanguageModel('pegasus1.2', {
      client: mockClient,
      indexId: 'test-index-id',
      modelId: 'pegasus1.2',
    });
  });

  describe('metadata', () => {
    it('should have correct specification version', () => {
      expect(model.specificationVersion).toBe('v2');
    });

    it('should have correct provider name', () => {
      expect(model.provider).toBe('twelvelabs');
    });

    it('should not support image URLs', () => {
      expect(model.supportsImageUrls).toBe(false);
    });

    it('should not support object generation', () => {
      expect(model.supportsObjectGeneration).toBe(false);
    });

    it('should not support tool calls', () => {
      expect(model.supportsToolCalls).toBe(false);
    });

    it('should support streaming', () => {
      expect(model.supportsStreaming).toBe(true);
    });
  });

  describe('doGenerate', () => {
    it('should generate text response for video analysis', async () => {
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'What is in this video?',
        videoInfo: {
          videoUrl: 'https://example.com/video.mp4',
          mediaType: 'video/mp4',
        },
      });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: 'What is in this video?' },
            ],
          },
        ],
        temperature: 0.7,
      };

      const result = await model.doGenerate(options);

      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'This is the analysis result',
      });
      expect(result.finishReason).toBe('stop');
      expect(result.usage).toBeDefined();
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.providerMetadata).toBeDefined();
      expect(result.providerMetadata?.twelvelabs?.videoId).toBe('video-456');
      expect(result.providerMetadata?.twelvelabs?.newVideoUploaded).toBe(true);
    });

    it('should reuse existing video ID', async () => {
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'What happens next?',
        videoInfo: {
          videoId: 'existing-video-id',
          mediaType: 'video/mp4',
        },
      });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'What happens next?' }],
          },
        ],
      };

      const result = await model.doGenerate(options);

      expect(mockClient.tasks.create).not.toHaveBeenCalled();
      expect(mockClient.analyze).toHaveBeenCalledWith({
        videoId: 'existing-video-id',
        prompt: 'What happens next?',
      });
      expect(result.providerMetadata?.twelvelabs?.videoId).toBe(
        'existing-video-id',
      );
      expect(result.providerMetadata?.twelvelabs?.newVideoUploaded).toBe(false);
    });

    it('should throw NoContentGeneratedError when no result', async () => {
      mockClient.analyze.mockResolvedValue({ data: '' });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Test' }],
          },
        ],
      };

      await expect(model.doGenerate(options)).rejects.toThrow(
        NoContentGeneratedError,
      );
    });

    it('should throw error when no video content provided', async () => {
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'Test prompt',
        videoInfo: undefined,
      });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Test' }],
          },
        ],
      };

      await expect(model.doGenerate(options)).rejects.toThrow(
        'No video content provided. Please include a video file or reference in your message.',
      );
    });

    it('should handle video upload from URL', async () => {
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'Analyze this',
        videoInfo: {
          videoUrl: 'https://example.com/video.mp4',
          mediaType: 'video/mp4',
        },
      });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Analyze this' }],
          },
        ],
      };

      const result = await model.doGenerate(options);

      expect(mockClient.tasks.create).toHaveBeenCalledWith({
        indexId: 'test-index-id',
        videoUrl: 'https://example.com/video.mp4',
      });
      expect(mockClient.tasks.waitForDone).toHaveBeenCalledWith('task-123', {
        sleepInterval: 5,
      });
      expect(result.providerMetadata?.twelvelabs?.videoId).toBe('video-456');
    });

    it('should handle Uint8Array video data', async () => {
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      const videoData = new Uint8Array([1, 2, 3, 4]);
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'Test',
        videoInfo: {
          videoData: videoData,
          mediaType: 'video/mp4',
        },
      });

      mockClient.tasks.create.mockResolvedValue({
        id: 'task-789',
      });

      mockClient.tasks.waitForDone.mockResolvedValue({
        id: 'task-789',
        status: 'ready',
        videoId: 'video-456',
      });

      mockClient.analyze.mockResolvedValue({
        data: 'Analysis of uploaded video',
      });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Test' }],
          },
        ],
      };

      const result = await model.doGenerate(options);

      expect(mockClient.tasks.create).toHaveBeenCalledWith({
        indexId: 'test-index-id',
        videoFile: expect.any(Blob),
      });
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Analysis of uploaded video',
      });
      expect(result.providerMetadata?.twelvelabs?.newVideoUploaded).toBe(true);
    });

    it('should map errors correctly', async () => {
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'Test',
        videoInfo: {
          videoUrl: 'https://example.com/video.mp4',
          mediaType: 'video/mp4',
        },
      });

      const testError = new Error('API Error');
      mockClient.tasks.create.mockRejectedValue(testError);

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Test' }],
          },
        ],
      };

      await expect(model.doGenerate(options)).rejects.toThrow();
      expect(mapTwelveLabsError).toHaveBeenCalledWith(testError);
    });
  });

  describe('doStream', () => {
    it('should stream text response', async () => {
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'Stream this analysis',
        videoInfo: {
          videoUrl: 'https://example.com/video.mp4',
          mediaType: 'video/mp4',
        },
      });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Stream this analysis' }],
          },
        ],
      };

      const result = await model.doStream(options);

      expect(result.stream).toBeDefined();
      expect(result.request).toBeDefined();

      // Read the stream
      const reader = result.stream.getReader();
      const chunks: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toHaveLength(7); // stream-start + text-start + 3 text chunks + text-end + finish
      expect(chunks[0].type).toBe('stream-start');
      expect(chunks[1].type).toBe('text-start');
      expect(chunks[2]).toEqual({
        type: 'text-delta',
        id: '0',
        delta: 'Streaming ',
      });
      expect(chunks[3]).toEqual({
        type: 'text-delta',
        id: '0',
        delta: 'result ',
      });
      expect(chunks[4]).toEqual({ type: 'text-delta', id: '0', delta: 'text' });
      expect(chunks[5].type).toBe('text-end');
      expect(chunks[6].type).toBe('finish');
      expect(chunks[6].finishReason).toBe('stop');
      expect(chunks[6].usage).toBeDefined();
      expect(chunks[6].usage.inputTokens).toBeGreaterThan(0);
      expect(chunks[6].usage.outputTokens).toBeGreaterThan(0);
    });

    it('should handle streaming with existing video ID', async () => {
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'Continue analysis',
        videoInfo: {
          videoId: 'reused-video-id',
          mediaType: 'video/mp4',
        },
      });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Continue' }],
          },
        ],
      };

      const result = await model.doStream(options);

      expect(mockClient.tasks.create).not.toHaveBeenCalled();
      expect(mockClient.analyzeStream).toHaveBeenCalledWith({
        videoId: 'reused-video-id',
        prompt: 'Continue analysis',
      });
    });

    it('should handle string chunks in stream', async () => {
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'Test',
        videoInfo: {
          videoUrl: 'https://example.com/video.mp4',
          mediaType: 'video/mp4',
        },
      });

      mockClient.analyzeStream.mockImplementation(async function* () {
        yield 'String chunk 1';
        yield 'String chunk 2';
      });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Test' }],
          },
        ],
      };

      const result = await model.doStream(options);
      const reader = result.stream.getReader();
      const chunks: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks[0].type).toBe('stream-start');
      expect(chunks[1].type).toBe('text-start');
      expect(chunks[2]).toEqual({
        type: 'text-delta',
        id: '0',
        delta: 'String chunk 1',
      });
      expect(chunks[3]).toEqual({
        type: 'text-delta',
        id: '0',
        delta: 'String chunk 2',
      });
    });

    it('should handle stream errors', async () => {
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'Test',
        videoInfo: {
          videoUrl: 'https://example.com/video.mp4',
          mediaType: 'video/mp4',
        },
      });

      const testError = new Error('Stream error');
      mockClient.analyzeStream.mockImplementation(async function* () {
        yield { text: 'Start' };
        throw testError;
      });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Test' }],
          },
        ],
      };

      const result = await model.doStream(options);
      const reader = result.stream.getReader();

      // Read chunks until we get to the text delta
      const chunks: any[] = [];
      try {
        for (let i = 0; i < 3; i++) {
          const { value } = await reader.read();
          chunks.push(value);
        }
        expect(chunks[0].type).toBe('stream-start');
        expect(chunks[1].type).toBe('text-start');
        expect(chunks[2]).toEqual({
          type: 'text-delta',
          id: '0',
          delta: 'Start',
        });

        // Next read should throw the error
        await reader.read();
        throw new Error('Should have thrown');
      } catch (error) {
        // The error should be mapped
        expect(mapTwelveLabsError).toHaveBeenCalledWith(testError);
      }
    });

    it('should throw error when no content is generated in stream', async () => {
      mockClient.analyzeStream.mockImplementation(async function* () {
        // Empty stream
      });

      const options = {
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Test' }],
          },
        ],
      };

      const result = await model.doStream(options);
      const reader = result.stream.getReader();

      await expect(reader.read()).rejects.toThrow('No content generated');
    });
  });

  describe('video ID reuse demonstration', () => {
    it('should demonstrate efficient video ID reuse for multiple questions', async () => {
      // First request: Upload video
      const { convertToTwelveLabsPrompt } = await import(
        './convert-to-twelvelabs-prompt'
      );
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'What is happening in this video?',
        videoInfo: {
          videoUrl: 'https://example.com/test-video.mp4',
          mediaType: 'video/mp4',
        },
      });

      const firstRequest = await model.doGenerate({
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'What is happening?' }],
          },
        ],
      });

      expect(firstRequest.providerMetadata?.twelvelabs?.videoId).toBe(
        'video-456',
      );
      expect(firstRequest.providerMetadata?.twelvelabs?.newVideoUploaded).toBe(
        true,
      );
      expect(mockClient.tasks.create).toHaveBeenCalledTimes(1);

      // Second request: Reuse video ID
      vi.clearAllMocks();
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'How many people are in the video?',
        videoInfo: {
          videoId: 'video-456', // Reusing the video ID from first request
          mediaType: 'video/mp4',
        },
      });

      const secondRequest = await model.doGenerate({
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'How many people?' }],
          },
        ],
      });

      expect(secondRequest.providerMetadata?.twelvelabs?.videoId).toBe(
        'video-456',
      );
      expect(secondRequest.providerMetadata?.twelvelabs?.newVideoUploaded).toBe(
        false,
      );
      expect(mockClient.tasks.create).not.toHaveBeenCalled(); // No new upload

      // Third request: Reuse video ID again
      vi.clearAllMocks();
      (convertToTwelveLabsPrompt as any).mockReturnValue({
        prompt: 'What is the main color in the video?',
        videoInfo: {
          videoId: 'video-456', // Still reusing the same video ID
          mediaType: 'video/mp4',
        },
      });

      const thirdRequest = await model.doGenerate({
        prompt: [
          {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'What color?' }],
          },
        ],
      });

      expect(thirdRequest.providerMetadata?.twelvelabs?.videoId).toBe(
        'video-456',
      );
      expect(thirdRequest.providerMetadata?.twelvelabs?.newVideoUploaded).toBe(
        false,
      );
      expect(mockClient.tasks.create).not.toHaveBeenCalled(); // No new upload
    });
  });
});
