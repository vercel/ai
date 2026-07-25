import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import {
  injectInterfazeVideoSentinels,
  resolveInterfazeVideoFileParts,
} from './interfaze-video-parts';

describe('injectInterfazeVideoSentinels + resolveInterfazeVideoFileParts', () => {
  it('round-trips a data: video part that is the only content in the message', () => {
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'video/mp4',
            filename: 'clip.mp4',
            data: { type: 'data', data: 'AQID' },
          },
        ],
      },
    ];

    const injected = injectInterfazeVideoSentinels(prompt);

    const args = {
      messages: [
        { role: 'user', content: (injected[0] as any).content[0].text },
      ],
    };

    const resolved = resolveInterfazeVideoFileParts(args);
    expect(resolved.messages[0].content).toEqual([
      {
        type: 'file',
        file: {
          file_data: 'data:video/mp4;base64,AQID',
          filename: 'clip.mp4',
          format: 'video/mp4',
        },
      },
    ]);
  });

  it('round-trips a url video part alongside a text part', () => {
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What happens in this clip?' },
          {
            type: 'file',
            mediaType: 'video/mp4',
            data: { type: 'url', url: new URL('https://example.com/clip.mp4') },
          },
        ],
      },
    ];

    const injected = injectInterfazeVideoSentinels(prompt);
    const args = {
      messages: [
        {
          role: 'user',
          content: (injected[0] as any).content.map((part: any) =>
            part.type === 'text' ? { type: 'text', text: part.text } : part,
          ),
        },
      ],
    };

    const resolved = resolveInterfazeVideoFileParts(args);
    expect(resolved.messages[0].content).toEqual([
      { type: 'text', text: 'What happens in this clip?' },
      {
        type: 'file',
        file: {
          file_data: 'https://example.com/clip.mp4',
          format: 'video/mp4',
        },
      },
    ]);
  });

  it('leaves non-video file parts and non-user messages untouched', () => {
    const prompt: LanguageModelV4Prompt = [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: 'AQID' },
          },
        ],
      },
    ];

    const injected = injectInterfazeVideoSentinels(prompt);
    expect(injected).toEqual(prompt);
  });

  it('is a no-op for messages with no file parts', () => {
    const args = {
      messages: [{ role: 'user', content: 'just text' }],
    };
    expect(resolveInterfazeVideoFileParts(args)).toEqual(args);
  });
});
