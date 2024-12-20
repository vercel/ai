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
          modelSupportsUrl: undefined,
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
          modelSupportsUrl: undefined,
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
      it('should pass through URLs when the model supports a particular URL', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
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
          modelSupportsUrl: () => true,
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

      it('should download the URL as an asset when the model does not support a URL', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
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
          modelSupportsUrl: () => false,
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

      it('should handle file parts with base64 string data', async () => {
        const base64Data = 'SGVsbG8sIFdvcmxkIQ=='; // "Hello, World!" in base64
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
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
          modelSupportsUrl: undefined,
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
          modelSupportsUrl: undefined,
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
          modelSupportsUrl: undefined,
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
          modelSupportsUrl: undefined,
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

      it('should download files for user file parts with string URLs when model does not support the particular URL', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
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
          modelSupportsUrl: url =>
            url.toString() !== 'https://example.com/document.pdf',
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

      it('does not download URLs for user file parts for URL objects when model does support the URL', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
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
          modelSupportsUrl: url =>
            url.toString() === 'https://example.com/document.pdf',
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mimeType: 'application/pdf',
                data: new URL('https://example.com/document.pdf'),
              },
            ],
          },
        ]);
      });

      it('it should default to downloading the URL when the model does not provider a supportsUrl function', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            type: 'messages',
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
          modelSupportsUrl: undefined,
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
          modelSupportsUrl: undefined,
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
          {},
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
          {},
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
          {},
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
                image: 'data:image/jpg;base64,/9j/3Q==',
              },
            ],
          },
          {},
        );

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'image',
              image: new Uint8Array([255, 216, 255, 221]),
              mimeType: 'image/jpeg',
            },
          ],
        });
      });

      it('should prefer detected mimetype', async () => {
        const result = convertToLanguageModelMessage(
          {
            role: 'user',
            content: [
              {
                type: 'image',
                // incorrect mimetype:
                image: 'data:image/png;base64,/9j/3Q==',
              },
            ],
          },
          {},
        );

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'image',
              image: new Uint8Array([255, 216, 255, 221]),
              mimeType: 'image/jpeg',
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
          {},
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
          {},
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
          {},
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
          {},
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

  describe('tool message', () => {
    it('should convert basic tool result message', () => {
      const result = convertToLanguageModelMessage(
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'toolName',
              toolCallId: 'toolCallId',
              result: { some: 'result' },
            },
          ],
        },
        {},
      );

      expect(result).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            result: { some: 'result' },
            toolCallId: 'toolCallId',
            toolName: 'toolName',
          },
        ],
      });
    });

    it('should convert tool result with provider metadata', () => {
      const result = convertToLanguageModelMessage(
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'toolName',
              toolCallId: 'toolCallId',
              result: { some: 'result' },
              experimental_providerMetadata: {
                'test-provider': {
                  'key-a': 'test-value-1',
                  'key-b': 'test-value-2',
                },
              },
            },
          ],
        },
        {},
      );

      expect(result).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            result: { some: 'result' },
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

    it('should include error flag', () => {
      const result = convertToLanguageModelMessage(
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'toolName',
              toolCallId: 'toolCallId',
              result: { some: 'result' },
              isError: true,
            },
          ],
        },
        {},
      );

      expect(result).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            result: { some: 'result' },
            toolCallId: 'toolCallId',
            toolName: 'toolName',
            isError: true,
          },
        ],
      });
    });

    it('should include multipart content', () => {
      const result = convertToLanguageModelMessage(
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'toolName',
              toolCallId: 'toolCallId',
              result: { some: 'result' },
              experimental_content: [
                { type: 'image', data: 'dGVzdA==', mimeType: 'image/png' },
              ],
            },
          ],
        },
        {},
      );

      expect(result).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            result: { some: 'result' },
            toolCallId: 'toolCallId',
            toolName: 'toolName',
            content: [
              { type: 'image', data: 'dGVzdA==', mimeType: 'image/png' },
            ],
          },
        ],
      });
    });
  });
});
