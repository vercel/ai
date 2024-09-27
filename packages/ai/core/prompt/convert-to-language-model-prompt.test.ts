import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import {
  convertToLanguageModelMessage,
  convertToLanguageModelPrompt,
} from './convert-to-language-model-prompt';

describe('convertToLanguageModelPrompt', () => {
  describe('user message', () => {
    describe('image parts', () => {
      it('should download images for user image parts with URLs when model does not support image URLs', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
            prompt: undefined,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    image: new URL('https://example.com/image.png'),
                  },
                ],
              },
            ],
          },
          modelSupportsImageUrls: false,
          downloadImplementation: async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/image.png'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mimeType: 'image/png',
            };
          },
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'image',
                mimeType: 'image/png',
                image: new Uint8Array([0, 1, 2, 3]),
              },
            ],
          },
        ]);
      });

      it('should download images for user image parts with string URLs when model does not support image URLs', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
            prompt: undefined,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    image: 'https://example.com/image.png',
                  },
                ],
              },
            ],
          },
          modelSupportsImageUrls: false,
          downloadImplementation: async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/image.png'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mimeType: 'image/png',
            };
          },
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'image',
                mimeType: 'image/png',
                image: new Uint8Array([0, 1, 2, 3]),
              },
            ],
          },
        ]);
      });
    });

    describe('file parts', () => {
      it('should handle file parts with URL data', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
            prompt: undefined,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: new URL('https://example.com/document.pdf'),
                    mimeType: 'application/pdf',
                  },
                ],
              },
            ],
          },
          modelSupportsImageUrls: true,
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: new URL('https://example.com/document.pdf'),
                mimeType: 'application/pdf',
              },
            ],
          },
        ]);
      });

      it('should handle file parts with base64 string data', async () => {
        const base64Data = 'SGVsbG8sIFdvcmxkIQ=='; // "Hello, World!" in base64
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
            prompt: undefined,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: base64Data,
                    mimeType: 'text/plain',
                  },
                ],
              },
            ],
          },
          modelSupportsImageUrls: true,
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: base64Data,
                mimeType: 'text/plain',
              },
            ],
          },
        ]);
      });

      it('should handle file parts with Uint8Array data', async () => {
        const uint8Data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" in ASCII
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
            prompt: undefined,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: uint8Data,
                    mimeType: 'text/plain',
                  },
                ],
              },
            ],
          },
          modelSupportsImageUrls: true,
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'SGVsbG8=', // base64 encoded "Hello"
                mimeType: 'text/plain',
              },
            ],
          },
        ]);
      });

      it('should download files for user file parts with URL objects when model does not support downloads', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
            prompt: undefined,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: new URL('https://example.com/document.pdf'),
                    mimeType: 'application/pdf',
                  },
                ],
              },
            ],
          },
          modelSupportsImageUrls: false,
          downloadImplementation: async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/document.pdf'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mimeType: 'application/pdf',
            };
          },
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mimeType: 'application/pdf',
                data: convertUint8ArrayToBase64(new Uint8Array([0, 1, 2, 3])),
              },
            ],
          },
        ]);
      });

      it('should download files for user file parts with string URLs when model does not support downloads', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
            prompt: undefined,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: 'https://example.com/document.pdf',
                    mimeType: 'application/pdf',
                  },
                ],
              },
            ],
          },
          modelSupportsImageUrls: false,
          downloadImplementation: async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/document.pdf'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mimeType: 'application/pdf',
            };
          },
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mimeType: 'application/pdf',
                data: convertUint8ArrayToBase64(new Uint8Array([0, 1, 2, 3])),
              },
            ],
          },
        ]);
      });
    });

    describe('provider metadata', async () => {
      it('should add provider metadata to messages', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
            prompt: undefined,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'hello, world!',
                  },
                ],
                experimental_providerMetadata: {
                  'test-provider': {
                    'key-a': 'test-value-1',
                    'key-b': 'test-value-2',
                  },
                },
              },
            ],
          },
          modelSupportsImageUrls: undefined,
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'hello, world!',
                providerMetadata: undefined,
              },
            ],
            providerMetadata: {
              'test-provider': {
                'key-a': 'test-value-1',
                'key-b': 'test-value-2',
              },
            },
          },
        ]);
      });
    });
  });
});

describe('convertToLanguageModelMessage', () => {
  describe('user message', () => {
    describe('text parts', () => {
      it('should filter out empty text parts', async () => {
        const result = convertToLanguageModelMessage(
          { role: 'user', content: [{ type: 'text', text: '' }] },
          null,
        );

        expect(result).toEqual({
          role: 'user',
          content: [],
        });
      });

      it('should pass through non-empty text parts', async () => {
        const result = convertToLanguageModelMessage(
          {
            role: 'user',
            content: [{ type: 'text', text: 'hello, world!' }],
          },
          null,
        );

        expect(result).toEqual({
          role: 'user',
          content: [{ type: 'text', text: 'hello, world!' }],
        });
      });
    });

    describe('image parts', () => {
      it('should convert image string https url to URL object', async () => {
        const result = convertToLanguageModelMessage(
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: 'https://example.com/image.jpg',
              },
            ],
          },
          null,
        );

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'image',
              image: new URL('https://example.com/image.jpg'),
            },
          ],
        });
      });

      it('should convert image string data url to base64 content', async () => {
        const result = convertToLanguageModelMessage(
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: 'data:image/jpg;base64,dGVzdA==',
              },
            ],
          },
          null,
        );

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'image',
              image: new Uint8Array([116, 101, 115, 116]),
              mimeType: 'image/jpg',
            },
          ],
        });
      });
    });

    describe('file parts', () => {
      it('should convert file string https url to URL object', async () => {
        const result = convertToLanguageModelMessage(
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'https://example.com/image.jpg',
                mimeType: 'image/jpg',
              },
            ],
          },
          null,
        );

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'file',
              data: new URL('https://example.com/image.jpg'),
              mimeType: 'image/jpg',
            },
          ],
        });
      });

      it('should convert file string data url to base64 content', async () => {
        const result = convertToLanguageModelMessage(
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'data:image/jpg;base64,dGVzdA==',
                mimeType: 'image/jpg',
              },
            ],
          },
          null,
        );

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'dGVzdA==',
              mimeType: 'image/jpg',
            },
          ],
        });
      });
    });
  });

  describe('assistant message', () => {
    describe('text parts', () => {
      it('should ignore empty text parts', async () => {
        const result = convertToLanguageModelMessage(
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: '',
              },
              {
                type: 'tool-call',
                toolName: 'toolName',
                toolCallId: 'toolCallId',
                args: {},
              },
            ],
          },
          null,
        );

        expect(result).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              args: {},
              toolCallId: 'toolCallId',
              toolName: 'toolName',
            },
          ],
        });
      });
    });

    describe('tool call parts', () => {
      it('should pass through provider metadata', () => {
        const result = convertToLanguageModelMessage(
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'toolName',
                toolCallId: 'toolCallId',
                args: {},
                experimental_providerMetadata: {
                  'test-provider': {
                    'key-a': 'test-value-1',
                    'key-b': 'test-value-2',
                  },
                },
              },
            ],
          },
          null,
        );

        expect(result).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              args: {},
              toolCallId: 'toolCallId',
              toolName: 'toolName',
              providerMetadata: {
                'test-provider': {
                  'key-a': 'test-value-1',
                  'key-b': 'test-value-2',
                },
              },
            },
          ],
        });
      });
    });
  });
});
