import { describe, it, expect } from 'vitest';
import { InvalidPromptError } from '@ai-sdk/provider';
import { convertToTwelveLabsPrompt } from './convert-to-twelvelabs-prompt';

describe('convertToTwelveLabsPrompt', () => {
  it('should convert simple text message', () => {
    const prompt = [
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'What is in this video?' }],
      },
    ];

    const result = convertToTwelveLabsPrompt(prompt);

    expect(result.prompt).toBe('What is in this video?');
    expect(result.videoInfo).toBeUndefined();
  });

  it('should extract video URL from file part', () => {
    const prompt = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'Describe this video' },
          {
            type: 'file' as const,
            data: new URL('https://example.com/video.mp4'),
            mediaType: 'video/mp4',
          },
        ],
      },
    ];

    const result = convertToTwelveLabsPrompt(prompt);

    expect(result.prompt).toBe('Describe this video');
    expect(result.videoInfo).toEqual({
      videoUrl: 'https://example.com/video.mp4',
      mediaType: 'video/mp4',
    });
  });

  it('should use video ID from provider options', () => {
    const prompt = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'What happens next?' },
          {
            type: 'file' as const,
            data: new URL('dummy://reuse'),
            mediaType: 'video/mp4',
            providerOptions: {
              twelvelabs: {
                videoId: 'existing-video-id',
              },
            },
          },
        ],
      },
    ];

    const result = convertToTwelveLabsPrompt(prompt);

    expect(result.prompt).toBe('What happens next?');
    expect(result.videoInfo).toEqual({
      videoId: 'existing-video-id',
      mediaType: 'video/mp4',
    });
  });

  it('should keep video data as Uint8Array', () => {
    const videoData = new Uint8Array([1, 2, 3, 4]);
    const prompt = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'Analyze' },
          {
            type: 'file' as const,
            data: videoData,
            mediaType: 'video/mp4',
          },
        ],
      },
    ];

    const result = convertToTwelveLabsPrompt(prompt);

    expect(result.prompt).toBe('Analyze');
    expect(result.videoInfo).toEqual({
      videoData: videoData,
      mediaType: 'video/mp4',
    });
  });

  it('should combine multiple text parts', () => {
    const prompt = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'First part' },
          { type: 'text' as const, text: 'Second part' },
          { type: 'text' as const, text: 'Third part' },
        ],
      },
    ];

    const result = convertToTwelveLabsPrompt(prompt);

    expect(result.prompt).toBe('First part Second part Third part');
    expect(result.videoInfo).toBeUndefined();
  });

  it('should support various video media types', () => {
    const mediaTypes = [
      'video/mp4',
      'video/mpeg',
      'video/webm',
      'application/x-matroska',
      'application/octet-stream',
    ];

    mediaTypes.forEach(mediaType => {
      const prompt = [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: 'Test' },
            {
              type: 'file' as const,
              data: new URL('https://example.com/video'),
              mediaType,
            },
          ],
        },
      ];

      const result = convertToTwelveLabsPrompt(prompt);
      expect(result.videoInfo?.mediaType).toBe(mediaType);
    });
  });

  it('should ignore non-video file parts', () => {
    const prompt = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'Check this' },
          {
            type: 'file' as const,
            data: new URL('https://example.com/image.jpg'),
            mediaType: 'image/jpeg',
          },
        ],
      },
    ];

    const result = convertToTwelveLabsPrompt(prompt);

    expect(result.prompt).toBe('Check this');
    expect(result.videoInfo).toBeUndefined();
  });

  it('should ignore assistant messages', () => {
    const prompt = [
      {
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: 'I will help you' }],
      },
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'Analyze this' }],
      },
    ];

    const result = convertToTwelveLabsPrompt(prompt);

    expect(result.prompt).toBe('Analyze this');
    expect(result.videoInfo).toBeUndefined();
  });

  it('should throw error when no text content is found', () => {
    const prompt = [
      {
        role: 'system' as const,
        content: 'You are a helpful assistant',
      },
    ];

    expect(() => convertToTwelveLabsPrompt(prompt)).toThrow(InvalidPromptError);
    expect(() => convertToTwelveLabsPrompt(prompt)).toThrow(
      'No text content found in user message',
    );
  });

  it('should throw error for empty user message', () => {
    const prompt = [
      {
        role: 'user' as const,
        content: [],
      },
    ];

    expect(() => convertToTwelveLabsPrompt(prompt)).toThrow(InvalidPromptError);
  });
});
