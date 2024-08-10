import { convertToCoreMessages } from './convert-to-core-messages';
import { Attachment } from '@ai-sdk/ui-utils';
import { ToolResult } from '../generate-text/tool-result';

describe('convertToCoreMessages', () => {
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
      const toolInvocation: ToolResult<string, unknown, unknown> = {
        toolCallId: 'call1',
        toolName: 'calculator',
        args: { operation: 'add', numbers: [1, 2] },
        result: '3',
      };
      const result = convertToCoreMessages([
        {
          role: 'assistant',
          content: 'Let me calculate that for you.',
          toolInvocations: [toolInvocation],
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
              args: { operation: 'add', numbers: [1, 2] },
              result: '3',
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
  });

  describe('error handling', () => {
    it('should throw an error for unhandled roles', () => {
      expect(() => {
        convertToCoreMessages([
          { role: 'unknown' as any, content: 'unknown role message' },
        ]);
      }).toThrow('Unhandled role: unknown');
    });
  });
});
