import { Attachment, Message } from '@ai-sdk/ui-utils';
import { convertToCoreMessages } from './convert-to-core-messages';
import { tool } from '../tool/tool';
import { z } from 'zod';

describe('system message', () => {
  it('should convert a simple system message', () => {
    const result = convertToCoreMessages([
      { role: 'system', content: 'System message' },
    ]);

    expect(result).toEqual([{ role: 'system', content: 'System message' }]);
  });
});

describe('user message', () => {
  it('should convert a simple user message', () => {
    const result = convertToCoreMessages([
      { role: 'user', content: 'Hello, AI!' },
    ]);

    expect(result).toEqual([{ role: 'user', content: 'Hello, AI!' }]);
  });

  it('should handle user message with attachments', () => {
    const attachment: Attachment = {
      contentType: 'image/jpeg',
      url: 'https://example.com/image.jpg',
    };

    const result = convertToCoreMessages([
      {
        role: 'user',
        content: 'Check this image',
        experimental_attachments: [attachment],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image' },
          { type: 'image', image: new URL('https://example.com/image.jpg') },
        ],
      },
    ]);
  });

  it('should handle user message with attachments (file)', () => {
    const attachment: Attachment = {
      contentType: 'application/pdf',
      url: 'https://example.com/document.pdf',
    };

    const result = convertToCoreMessages([
      {
        role: 'user',
        content: 'Check this document',
        experimental_attachments: [attachment],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this document' },
          {
            type: 'file',
            data: new URL('https://example.com/document.pdf'),
            mimeType: 'application/pdf',
          },
        ],
      },
    ]);
  });

  it('should handle user message with attachment URLs', () => {
    const attachment: Attachment = {
      contentType: 'image/jpeg',
      url: 'data:image/jpg;base64,dGVzdA==',
    };

    const result = convertToCoreMessages([
      {
        role: 'user',
        content: 'Check this image',
        experimental_attachments: [attachment],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image' },
          { type: 'image', image: new Uint8Array([116, 101, 115, 116]) },
        ],
      },
    ]);
  });

  it('should handle user message with attachment URLs (file)', () => {
    const attachment: Attachment = {
      contentType: 'application/pdf',
      url: 'data:application/pdf;base64,dGVzdA==',
    };

    const result = convertToCoreMessages([
      {
        role: 'user',
        content: 'Check this document',
        experimental_attachments: [attachment],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this document' },
          {
            type: 'file',
            data: 'dGVzdA==',
            mimeType: 'application/pdf',
          },
        ],
      },
    ]);
  });

  it('should throw an error for invalid attachment URLs', () => {
    const attachment: Attachment = {
      contentType: 'image/jpeg',
      url: 'invalid-url',
    };

    expect(() => {
      convertToCoreMessages([
        {
          role: 'user',
          content: 'Check this image',
          experimental_attachments: [attachment],
        },
      ]);
    }).toThrow('Invalid URL: invalid-url');
  });

  it('should throw an error for file attachments without contentType', () => {
    const attachment: Attachment = {
      url: 'data:application/pdf;base64,dGVzdA==',
    };

    expect(() => {
      convertToCoreMessages([
        {
          role: 'user',
          content: 'Check this file',
          experimental_attachments: [attachment],
        },
      ]);
    }).toThrow(
      'If the attachment is not an image or text, it must specify a content type',
    );
  });

  it('should throw an error for invalid data URL format', () => {
    const attachment: Attachment = {
      contentType: 'image/jpeg',
      url: 'data:image/jpg;base64',
    };

    expect(() => {
      convertToCoreMessages([
        {
          role: 'user',
          content: 'Check this image',
          experimental_attachments: [attachment],
        },
      ]);
    }).toThrow(`Invalid data URL format: ${attachment.url}`);
  });

  it('should throw an error for unsupported attachment protocols', () => {
    const attachment: Attachment = {
      contentType: 'image/jpeg',
      url: 'ftp://example.com/image.jpg',
    };

    expect(() => {
      convertToCoreMessages([
        {
          role: 'user',
          content: 'Check this image',
          experimental_attachments: [attachment],
        },
      ]);
    }).toThrow('Unsupported URL protocol: ftp:');
  });
});

describe('assistant message', () => {
  it('should convert a simple assistant message', () => {
    const result = convertToCoreMessages([
      { role: 'assistant', content: 'Hello, human!' },
    ]);

    expect(result).toEqual([{ role: 'assistant', content: 'Hello, human!' }]);
  });

  it('should handle assistant message with tool invocations', () => {
    const result = convertToCoreMessages([
      {
        role: 'assistant',
        content: 'Let me calculate that for you.',
        toolInvocations: [
          {
            state: 'result',
            toolCallId: 'call1',
            toolName: 'calculator',
            args: { operation: 'add', numbers: [1, 2] },
            result: '3',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me calculate that for you.' },
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'calculator',
            args: { operation: 'add', numbers: [1, 2] },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call1',
            toolName: 'calculator',
            result: '3',
          },
        ],
      },
    ]);
  });

  it('should handle assistant message with tool invocations that have multi-part responses', () => {
    const tools = {
      screenshot: tool({
        parameters: z.object({}),
        execute: async () => 'imgbase64',
        experimental_toToolResultContent: result => [
          { type: 'image', data: result },
        ],
      }),
    };

    const result = convertToCoreMessages(
      [
        {
          role: 'assistant',
          content: 'Let me calculate that for you.',
          toolInvocations: [
            {
              state: 'result',
              toolCallId: 'call1',
              toolName: 'screenshot',
              args: {},
              result: 'imgbase64',
            },
          ],
        },
      ],
      { tools }, // separate tools to ensure that types are inferred correctly
    );

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me calculate that for you.' },
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'screenshot',
            args: {},
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call1',
            toolName: 'screenshot',
            result: [{ type: 'image', data: 'imgbase64' }],
            experimental_content: [{ type: 'image', data: 'imgbase64' }],
          },
        ],
      },
    ]);
  });
});

describe('multiple messages', () => {
  it('should handle a conversation with multiple messages', () => {
    const result = convertToCoreMessages([
      { role: 'user', content: "What's the weather like?" },
      { role: 'assistant', content: "I'll check that for you." },
      { role: 'user', content: 'Thanks!' },
    ]);

    expect(result).toEqual([
      { role: 'user', content: "What's the weather like?" },
      { role: 'assistant', content: "I'll check that for you." },
      { role: 'user', content: 'Thanks!' },
    ]);
  });

  it('should convert fully typed Message[]', () => {
    const messages: Message[] = [
      {
        id: '1',
        role: 'user',
        content: 'What is the weather in Tokyo?',
      },
      {
        id: '2',
        role: 'assistant',
        content: 'It is sunny in Tokyo.',
      },
    ];

    const result = convertToCoreMessages(messages);

    expect(result).toStrictEqual([
      {
        role: 'user',
        content: 'What is the weather in Tokyo?',
      },
      {
        role: 'assistant',
        content: 'It is sunny in Tokyo.',
      },
    ]);
  });
});

describe('error handling', () => {
  it('should throw an error for unhandled roles', () => {
    expect(() => {
      convertToCoreMessages([
        { role: 'unknown' as any, content: 'unknown role message' },
      ]);
    }).toThrow('Unsupported role: unknown');
  });
});
