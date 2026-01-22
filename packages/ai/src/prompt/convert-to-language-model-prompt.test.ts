import { describe, expect, it, vi } from 'vitest';
import { createDefaultDownloadFunction } from '../util/download/download-function';
import {
  convertToLanguageModelMessage,
  convertToLanguageModelPrompt,
} from './convert-to-language-model-prompt';

describe('convertToLanguageModelPrompt', () => {
  describe('system message', () => {
    it('should convert a string system message', async () => {
      const result = await convertToLanguageModelPrompt({
        prompt: {
          system: 'INSTRUCTIONS',
          messages: [{ role: 'user', content: 'Hello, world!' }],
        },
        supportedUrls: {},
        download: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": "INSTRUCTIONS",
            "role": "system",
          },
          {
            "content": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "providerOptions": undefined,
            "role": "user",
          },
        ]
      `);
    });

    it('should convert a SystemModelMessage system message', async () => {
      const result = await convertToLanguageModelPrompt({
        prompt: {
          system: {
            role: 'system',
            content: 'INSTRUCTIONS',
            providerOptions: { test: { value: 'test' } },
          },
          messages: [{ role: 'user', content: 'Hello, world!' }],
        },
        supportedUrls: {},
        download: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": "INSTRUCTIONS",
            "providerOptions": {
              "test": {
                "value": "test",
              },
            },
            "role": "system",
          },
          {
            "content": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "providerOptions": undefined,
            "role": "user",
          },
        ]
      `);
    });

    it('should convert an array of SystemModelMessage system messages', async () => {
      const result = await convertToLanguageModelPrompt({
        prompt: {
          system: [
            { role: 'system', content: 'INSTRUCTIONS' },
            { role: 'system', content: 'INSTRUCTIONS 2' },
          ],
          messages: [{ role: 'user', content: 'Hello, world!' }],
        },
        supportedUrls: {},
        download: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": "INSTRUCTIONS",
            "providerOptions": undefined,
            "role": "system",
          },
          {
            "content": "INSTRUCTIONS 2",
            "providerOptions": undefined,
            "role": "system",
          },
          {
            "content": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "providerOptions": undefined,
            "role": "user",
          },
        ]
      `);
    });
  });

  describe('user message', () => {
    describe('image parts', () => {
      it('should download images for user image parts with URLs when model does not support image URLs', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
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
          supportedUrls: {},
          download: createDefaultDownloadFunction(async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/image.png'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'image/png',
            };
          }),
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: new Uint8Array([0, 1, 2, 3]),
              },
            ],
          },
        ]);
      });

      it('should download images for user image parts with string URLs when model does not support image URLs', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
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
          supportedUrls: {},
          download: createDefaultDownloadFunction(async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/image.png'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'image/png',
            };
          }),
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: new Uint8Array([0, 1, 2, 3]),
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
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: new URL('https://example.com/document.pdf'),
                    mediaType: 'application/pdf',
                  },
                ],
              },
            ],
          },
          supportedUrls: {
            '*': [/^https:\/\/.*$/],
          },
          download: undefined,
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: new URL('https://example.com/document.pdf'),
                mediaType: 'application/pdf',
              },
            ],
          },
        ]);
      });

      it('should download the URL as an asset when the model does not support a URL', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: new URL('https://example.com/document.pdf'),
                    mediaType: 'application/pdf',
                  },
                ],
              },
            ],
          },
          supportedUrls: {
            // PDF is not supported, but image/* is
            'image/*': [/^https:\/\/.*$/],
          },
          download: createDefaultDownloadFunction(async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/document.pdf'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'application/pdf',
            };
          }),
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new Uint8Array([0, 1, 2, 3]),
              },
            ],
          },
        ]);
      });

      it('should handle file parts with base64 string data', async () => {
        const base64Data = 'SGVsbG8sIFdvcmxkIQ=='; // "Hello, World!" in base64
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: base64Data,
                    mediaType: 'text/plain',
                  },
                ],
              },
            ],
          },
          supportedUrls: {
            'image/*': [/^https:\/\/.*$/],
          },
          download: undefined,
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: base64Data,
                mediaType: 'text/plain',
              },
            ],
          },
        ]);
      });

      it('should handle file parts with Uint8Array data', async () => {
        const uint8Data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" in ASCII
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: uint8Data,
                    mediaType: 'text/plain',
                  },
                ],
              },
            ],
          },
          supportedUrls: {
            'image/*': [/^https:\/\/.*$/],
          },
          download: undefined,
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: new Uint8Array([72, 101, 108, 108, 111]),
                mediaType: 'text/plain',
              },
            ],
          },
        ]);
      });

      it('should download files for user file parts with URL objects when model does not support downloads', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: new URL('https://example.com/document.pdf'),
                    mediaType: 'application/pdf',
                  },
                ],
              },
            ],
          },
          supportedUrls: {},
          download: createDefaultDownloadFunction(async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/document.pdf'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'application/pdf',
            };
          }),
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new Uint8Array([0, 1, 2, 3]),
              },
            ],
          },
        ]);
      });

      it('should download files for user file parts with string URLs when model does not support downloads', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: 'https://example.com/document.pdf',
                    mediaType: 'application/pdf',
                  },
                ],
              },
            ],
          },
          supportedUrls: {},
          download: createDefaultDownloadFunction(async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/document.pdf'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'application/pdf',
            };
          }),
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new Uint8Array([0, 1, 2, 3]),
              },
            ],
          },
        ]);
      });

      it('should download files for user file parts with string URLs when model does not support the particular URL', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: 'https://example.com/document.pdf',
                    mediaType: 'application/pdf',
                  },
                ],
              },
            ],
          },
          supportedUrls: {
            'application/pdf': [
              // everything except https://example.com/document.pdf
              /^(?!https:\/\/example\.com\/document\.pdf$).*$/,
            ],
          },
          download: createDefaultDownloadFunction(async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/document.pdf'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'application/pdf',
            };
          }),
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new Uint8Array([0, 1, 2, 3]),
              },
            ],
          },
        ]);
      });

      it('does not download URLs for user file parts for URL objects when model does support the URL', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: new URL('https://example.com/document.pdf'),
                    mediaType: 'application/pdf',
                  },
                ],
              },
            ],
          },
          supportedUrls: {
            'application/pdf': [
              // match exactly https://example.com/document.pdf
              /^https:\/\/example\.com\/document\.pdf$/,
            ],
          },
          download: undefined,
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new URL('https://example.com/document.pdf'),
              },
            ],
          },
        ]);
      });

      it('it should default to downloading the URL when the model does not provider a supportsUrl function', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: 'https://example.com/document.pdf',
                    mediaType: 'application/pdf',
                  },
                ],
              },
            ],
          },
          supportedUrls: {},
          download: createDefaultDownloadFunction(async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/document.pdf'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'application/pdf',
            };
          }),
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new Uint8Array([0, 1, 2, 3]),
              },
            ],
          },
        ]);
      });

      it('should handle file parts with filename', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: 'SGVsbG8sIFdvcmxkIQ==', // "Hello, World!" in base64
                    mediaType: 'text/plain',
                    filename: 'hello.txt',
                  },
                ],
              },
            ],
          },
          supportedUrls: {
            'image/*': [/^https:\/\/.*$/],
          },
          download: undefined,
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'SGVsbG8sIFdvcmxkIQ==',
                mediaType: 'text/plain',
                filename: 'hello.txt',
              },
            ],
          },
        ]);
      });

      it('should preserve filename when downloading file from URL', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: new URL('https://example.com/document.pdf'),
                    mediaType: 'application/pdf',
                    filename: 'important-document.pdf',
                  },
                ],
              },
            ],
          },
          supportedUrls: {},
          download: createDefaultDownloadFunction(async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/document.pdf'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'application/pdf',
            };
          }),
        });

        expect(result).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new Uint8Array([0, 1, 2, 3]),
                filename: 'important-document.pdf',
              },
            ],
          },
        ]);
      });

      it('should prioritize user-provided mediaType over downloaded file mediaType', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: new URL('https://example.com/image.jpg'),
                    mediaType: 'image/jpeg',
                  },
                ],
              },
            ],
          },
          supportedUrls: {},
          download: createDefaultDownloadFunction(async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/image.jpg'));
            return {
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'application/octet-stream',
            };
          }),
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "data": Uint8Array [
                    0,
                    1,
                    2,
                    3,
                  ],
                  "filename": undefined,
                  "mediaType": "image/jpeg",
                  "providerOptions": undefined,
                  "type": "file",
                },
              ],
              "providerOptions": undefined,
              "role": "user",
            },
          ]
        `);
      });

      it('should use downloaded file mediaType as fallback when user provides generic mediaType', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    data: new URL('https://example.com/document.txt'),
                    mediaType: 'application/octet-stream',
                  },
                ],
              },
            ],
          },
          supportedUrls: {},
          download: createDefaultDownloadFunction(async ({ url }) => {
            expect(url).toEqual(new URL('https://example.com/document.txt'));
            return {
              data: new Uint8Array([72, 101, 108, 108, 111]),
              mediaType: 'text/plain',
            };
          }),
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "data": Uint8Array [
                    72,
                    101,
                    108,
                    108,
                    111,
                  ],
                  "filename": undefined,
                  "mediaType": "application/octet-stream",
                  "providerOptions": undefined,
                  "type": "file",
                },
              ],
              "providerOptions": undefined,
              "role": "user",
            },
          ]
        `);
      });
    });

    describe('provider options', async () => {
      it('should add provider options to messages', async () => {
        const result = await convertToLanguageModelPrompt({
          prompt: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'hello, world!',
                  },
                ],
                providerOptions: {
                  'test-provider': {
                    'key-a': 'test-value-1',
                    'key-b': 'test-value-2',
                  },
                },
              },
            ],
          },
          supportedUrls: {},
          download: undefined,
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
            providerOptions: {
              'test-provider': {
                'key-a': 'test-value-1',
                'key-b': 'test-value-2',
              },
            },
          },
        ]);
      });
    });

    it('should download files when intermediate file cannot be downloaded', async () => {
      const imageUrlA = `http://example.com/my-image-A.png`; // supported
      const fileUrl = `http://127.0.0.1:3000/file`; // unsupported
      const imageUrlB = `http://example.com/my-image-B.png`; // supported

      const mockDownload = vi.fn().mockResolvedValue([
        {
          url: new URL(imageUrlA),
          data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]), // empty png and 0
          mediaType: 'image/png',
        },
        null,
        {
          url: new URL(imageUrlB),
          data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]), // empty png and 1
          mediaType: 'image/png',
        },
      ]);

      const result = await convertToLanguageModelPrompt({
        prompt: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', image: imageUrlA, mediaType: 'image/png' },
                {
                  type: 'file',
                  data: new URL(fileUrl),
                  mediaType: 'application/octet-stream',
                },
                { type: 'image', image: imageUrlB, mediaType: 'image/png' },
              ],
            },
          ],
        },
        supportedUrls: {
          '*': [/^https:\/\/.*$/],
        },
        download: mockDownload,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "data": Uint8Array [
                  137,
                  80,
                  78,
                  71,
                  13,
                  10,
                  26,
                  10,
                  0,
                ],
                "filename": undefined,
                "mediaType": "image/png",
                "providerOptions": undefined,
                "type": "file",
              },
              {
                "data": "http://127.0.0.1:3000/file",
                "filename": undefined,
                "mediaType": "application/octet-stream",
                "providerOptions": undefined,
                "type": "file",
              },
              {
                "data": Uint8Array [
                  137,
                  80,
                  78,
                  71,
                  13,
                  10,
                  26,
                  10,
                  1,
                ],
                "filename": undefined,
                "mediaType": "image/png",
                "providerOptions": undefined,
                "type": "file",
              },
            ],
            "providerOptions": undefined,
            "role": "user",
          },
        ]
      `);
    });
  });

  describe('tool message', () => {
    it('should combine 2 consecutive tool messages into a single tool message', async () => {
      const result = await convertToLanguageModelPrompt({
        prompt: {
          messages: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'toolCallId',
                  toolName: 'toolName',
                  input: {},
                },
                {
                  type: 'tool-approval-request',
                  approvalId: 'approvalId',
                  toolCallId: 'toolCallId',
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-approval-response',
                  approvalId: 'approvalId',
                  approved: true,
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolName: 'toolName',
                  toolCallId: 'toolCallId',
                  output: { type: 'json', value: { some: 'result' } },
                },
              ],
            },
          ],
        },
        supportedUrls: {},
        download: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "input": {},
                "providerExecuted": undefined,
                "providerOptions": undefined,
                "toolCallId": "toolCallId",
                "toolName": "toolName",
                "type": "tool-call",
              },
            ],
            "providerOptions": undefined,
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "json",
                  "value": {
                    "some": "result",
                  },
                },
                "providerOptions": undefined,
                "toolCallId": "toolCallId",
                "toolName": "toolName",
                "type": "tool-result",
              },
            ],
            "providerOptions": undefined,
            "role": "tool",
          },
        ]
      `);
    });
  });

  describe('custom download function', () => {
    it('should use custom download function to fetch URL content', async () => {
      const mockDownload = vi.fn().mockResolvedValue([
        {
          url: new URL('https://example.com/test-file.txt'),
          data: new Uint8Array([72, 101, 108, 108, 111]), // "Hello" in ASCII
          mediaType: 'text/plain',
        },
      ]);

      const result = await convertToLanguageModelPrompt({
        prompt: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: 'https://example.com/test-file.txt',
                  mediaType: 'text/plain',
                },
              ],
            },
          ],
        },
        supportedUrls: {}, // No URL support, so download should be triggered
        download: mockDownload,
      });

      expect(mockDownload).toHaveBeenCalledOnce();
      expect(mockDownload).toHaveBeenCalledWith([
        {
          url: new URL('https://example.com/test-file.txt'),
          isUrlSupportedByModel: false,
        },
      ]);

      expect(result).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'text/plain',
              data: new Uint8Array([72, 101, 108, 108, 111]),
            },
          ],
        },
      ]);
    });
  });
});

describe('convertToLanguageModelMessage', () => {
  describe('user message', () => {
    describe('text parts', () => {
      it('should filter out empty text parts', async () => {
        const result = convertToLanguageModelMessage({
          message: { role: 'user', content: [{ type: 'text', text: '' }] },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'user',
          content: [],
        });
      });

      it('should pass through non-empty text parts', async () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'hello, world!' }],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'user',
          content: [{ type: 'text', text: 'hello, world!' }],
        });
      });
    });

    describe('image parts', () => {
      it('should convert image string https url to URL object', async () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'user',
            content: [
              {
                type: 'image',
                image: 'https://example.com/image.jpg',
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'file',
              data: new URL('https://example.com/image.jpg'),
              mediaType: 'image/*', // wildcard since we don't know the exact type
            },
          ],
        });
      });

      it('should convert image string data url to base64 content', async () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'user',
            content: [
              {
                type: 'image',
                image: 'data:image/jpg;base64,/9j/3Q==',
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'file',
              data: '/9j/3Q==',
              mediaType: 'image/jpeg',
            },
          ],
        });
      });

      it('should prefer detected mediaType', async () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'user',
            content: [
              {
                type: 'image',
                // incorrect mediaType:
                image: 'data:image/png;base64,/9j/3Q==',
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'file',
              data: '/9j/3Q==',
              mediaType: 'image/jpeg',
            },
          ],
        });
      });
    });

    describe('file parts', () => {
      it('should convert file string https url to URL object', async () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'https://example.com/image.jpg',
                mediaType: 'image/jpg',
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'file',
              data: new URL('https://example.com/image.jpg'),
              mediaType: 'image/jpg',
            },
          ],
        });
      });

      it('should convert file string data url to base64 content', async () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'data:image/jpg;base64,dGVzdA==',
                mediaType: 'image/jpg',
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'dGVzdA==',
              mediaType: 'image/jpg',
            },
          ],
        });
      });
    });
  });

  describe('assistant message', () => {
    describe('text parts', () => {
      it('should ignore empty text parts when there are no provider options', async () => {
        const result = convertToLanguageModelMessage({
          message: {
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
                input: {},
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              input: {},
              toolCallId: 'toolCallId',
              toolName: 'toolName',
            },
          ],
        });
      });

      it('should include empty text parts when there are provider options', async () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: '',
                providerOptions: {
                  'test-provider': {
                    'key-a': 'test-value-1',
                  },
                },
              },
              {
                type: 'tool-call',
                toolName: 'toolName',
                toolCallId: 'toolCallId',
                input: {},
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "content": [
              {
                "providerOptions": {
                  "test-provider": {
                    "key-a": "test-value-1",
                  },
                },
                "text": "",
                "type": "text",
              },
              {
                "input": {},
                "providerExecuted": undefined,
                "providerOptions": undefined,
                "toolCallId": "toolCallId",
                "toolName": "toolName",
                "type": "tool-call",
              },
            ],
            "providerOptions": undefined,
            "role": "assistant",
          }
        `);
      });
    });

    describe('reasoning parts', () => {
      it('should pass through provider options', () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'hello, world!',
                providerOptions: {
                  'test-provider': {
                    'key-a': 'test-value-1',
                    'key-b': 'test-value-2',
                  },
                },
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'hello, world!',
              providerOptions: {
                'test-provider': {
                  'key-a': 'test-value-1',
                  'key-b': 'test-value-2',
                },
              },
            },
          ],
        });
      });

      it('should support a mix of reasoning, redacted reasoning, and text parts', () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: `I'm thinking`,
              },
              {
                type: 'reasoning',
                text: 'redacted-reasoning-data',
                providerOptions: {
                  'test-provider': { redacted: true },
                },
              },
              {
                type: 'reasoning',
                text: 'more thinking',
              },
              {
                type: 'text',
                text: 'hello, world!',
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: `I'm thinking`,
            },
            {
              type: 'reasoning',
              text: 'redacted-reasoning-data',
              providerOptions: {
                'test-provider': { redacted: true },
              },
            },
            {
              type: 'reasoning',
              text: 'more thinking',
            },
            {
              type: 'text',
              text: 'hello, world!',
            },
          ],
        });
      });
    });

    describe('tool call parts', () => {
      it('should pass through provider options', () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'toolName',
                toolCallId: 'toolCallId',
                input: {},
                providerOptions: {
                  'test-provider': {
                    'key-a': 'test-value-1',
                    'key-b': 'test-value-2',
                  },
                },
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              input: {},
              toolCallId: 'toolCallId',
              toolName: 'toolName',
              providerOptions: {
                'test-provider': {
                  'key-a': 'test-value-1',
                  'key-b': 'test-value-2',
                },
              },
            },
          ],
        });
      });

      it('should include providerExecuted flag', () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'toolName',
                toolCallId: 'toolCallId',
                input: {},
                providerExecuted: true,
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "content": [
              {
                "input": {},
                "providerExecuted": true,
                "providerOptions": undefined,
                "toolCallId": "toolCallId",
                "toolName": "toolName",
                "type": "tool-call",
              },
            ],
            "providerOptions": undefined,
            "role": "assistant",
          }
        `);
      });
    });

    describe('tool result parts', () => {
      it('should include providerExecuted flag', () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'toolCallId',
                toolName: 'toolName',
                output: { type: 'json', value: { some: 'result' } },
                providerOptions: {
                  'test-provider': {
                    'key-a': 'test-value-1',
                    'key-b': 'test-value-2',
                  },
                },
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "content": [
              {
                "output": {
                  "type": "json",
                  "value": {
                    "some": "result",
                  },
                },
                "providerOptions": {
                  "test-provider": {
                    "key-a": "test-value-1",
                    "key-b": "test-value-2",
                  },
                },
                "toolCallId": "toolCallId",
                "toolName": "toolName",
                "type": "tool-result",
              },
            ],
            "providerOptions": undefined,
            "role": "assistant",
          }
        `);
      });
    });

    describe('provider-executed tool calls and results', () => {
      it('should include providerExecuted flag', () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'toolName',
                toolCallId: 'toolCallId',
                input: {},
                providerExecuted: true,
                providerOptions: {
                  'test-provider': {
                    'key-a': 'test-value-1',
                    'key-b': 'test-value-2',
                  },
                },
              },
              {
                type: 'tool-result',
                toolCallId: 'toolCallId',
                toolName: 'toolName',
                output: { type: 'json', value: { some: 'result' } },
                providerOptions: {
                  'test-provider': {
                    'key-a': 'test-value-1',
                    'key-b': 'test-value-2',
                  },
                },
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "content": [
              {
                "input": {},
                "providerExecuted": true,
                "providerOptions": {
                  "test-provider": {
                    "key-a": "test-value-1",
                    "key-b": "test-value-2",
                  },
                },
                "toolCallId": "toolCallId",
                "toolName": "toolName",
                "type": "tool-call",
              },
              {
                "output": {
                  "type": "json",
                  "value": {
                    "some": "result",
                  },
                },
                "providerOptions": {
                  "test-provider": {
                    "key-a": "test-value-1",
                    "key-b": "test-value-2",
                  },
                },
                "toolCallId": "toolCallId",
                "toolName": "toolName",
                "type": "tool-result",
              },
            ],
            "providerOptions": undefined,
            "role": "assistant",
          }
        `);
      });
    });

    describe('file parts', () => {
      it('should convert file data correctly', async () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'assistant',
            content: [
              {
                type: 'file',
                data: 'dGVzdA==', // "test" in base64
                mediaType: 'application/pdf',
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'file',
              data: 'dGVzdA==',
              mediaType: 'application/pdf',
            },
          ],
        });
      });

      it('should preserve filename when present', async () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'assistant',
            content: [
              {
                type: 'file',
                data: 'dGVzdA==',
                mediaType: 'application/pdf',
                filename: 'test-document.pdf',
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'file',
              data: 'dGVzdA==',
              mediaType: 'application/pdf',
              filename: 'test-document.pdf',
            },
          ],
        });
      });

      it('should handle provider options', async () => {
        const result = convertToLanguageModelMessage({
          message: {
            role: 'assistant',
            content: [
              {
                type: 'file',
                data: 'dGVzdA==',
                mediaType: 'application/pdf',
                providerOptions: {
                  'test-provider': {
                    'key-a': 'test-value-1',
                    'key-b': 'test-value-2',
                  },
                },
              },
            ],
          },
          downloadedAssets: {},
        });

        expect(result).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'file',
              data: 'dGVzdA==',
              mediaType: 'application/pdf',
              providerOptions: {
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
      const result = convertToLanguageModelMessage({
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'toolName',
              toolCallId: 'toolCallId',
              output: { type: 'json', value: { some: 'result' } },
            },
          ],
        },
        downloadedAssets: {},
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "output": {
                "type": "json",
                "value": {
                  "some": "result",
                },
              },
              "providerOptions": undefined,
              "toolCallId": "toolCallId",
              "toolName": "toolName",
              "type": "tool-result",
            },
          ],
          "providerOptions": undefined,
          "role": "tool",
        }
      `);
    });

    it('should convert tool result with provider metadata', () => {
      const result = convertToLanguageModelMessage({
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'toolName',
              toolCallId: 'toolCallId',
              output: { type: 'json', value: { some: 'result' } },
              providerOptions: {
                'test-provider': {
                  'key-a': 'test-value-1',
                  'key-b': 'test-value-2',
                },
              },
            },
          ],
        },
        downloadedAssets: {},
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "output": {
                "type": "json",
                "value": {
                  "some": "result",
                },
              },
              "providerOptions": {
                "test-provider": {
                  "key-a": "test-value-1",
                  "key-b": "test-value-2",
                },
              },
              "toolCallId": "toolCallId",
              "toolName": "toolName",
              "type": "tool-result",
            },
          ],
          "providerOptions": undefined,
          "role": "tool",
        }
      `);
    });

    it('should include error flag', () => {
      const result = convertToLanguageModelMessage({
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'toolName',
              toolCallId: 'toolCallId',
              output: { type: 'json', value: { some: 'result' } },
            },
          ],
        },
        downloadedAssets: {},
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "output": {
                "type": "json",
                "value": {
                  "some": "result",
                },
              },
              "providerOptions": undefined,
              "toolCallId": "toolCallId",
              "toolName": "toolName",
              "type": "tool-result",
            },
          ],
          "providerOptions": undefined,
          "role": "tool",
        }
      `);
    });

    it('should include multipart content', () => {
      const result = convertToLanguageModelMessage({
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'toolName',
              toolCallId: 'toolCallId',
              output: {
                type: 'content',
                value: [
                  { type: 'file-url', url: 'https://example.com/image.png' },
                  {
                    type: 'file-data',
                    data: 'dGVzdA==',
                    mediaType: 'image/png',
                  },
                  { type: 'file-id', fileId: 'fileId' },
                  { type: 'file-id', fileId: { 'test-provider': 'fileId' } },
                  {
                    type: 'image-data',
                    data: 'dGVzdA==',
                    mediaType: 'image/png',
                  },
                  { type: 'image-url', url: 'https://example.com/image.png' },
                  { type: 'image-file-id', fileId: 'fileId' },
                  {
                    type: 'image-file-id',
                    fileId: { 'test-provider': 'fileId' },
                  },
                  {
                    type: 'custom',
                    providerOptions: {
                      'test-provider': {
                        'key-a': 'test-value-1',
                        'key-b': 'test-value-2',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
        downloadedAssets: {},
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "output": {
                "type": "content",
                "value": [
                  {
                    "type": "file-url",
                    "url": "https://example.com/image.png",
                  },
                  {
                    "data": "dGVzdA==",
                    "mediaType": "image/png",
                    "type": "file-data",
                  },
                  {
                    "fileId": "fileId",
                    "type": "file-id",
                  },
                  {
                    "fileId": {
                      "test-provider": "fileId",
                    },
                    "type": "file-id",
                  },
                  {
                    "data": "dGVzdA==",
                    "mediaType": "image/png",
                    "type": "image-data",
                  },
                  {
                    "type": "image-url",
                    "url": "https://example.com/image.png",
                  },
                  {
                    "fileId": "fileId",
                    "type": "image-file-id",
                  },
                  {
                    "fileId": {
                      "test-provider": "fileId",
                    },
                    "type": "image-file-id",
                  },
                  {
                    "providerOptions": {
                      "test-provider": {
                        "key-a": "test-value-1",
                        "key-b": "test-value-2",
                      },
                    },
                    "type": "custom",
                  },
                ],
              },
              "providerOptions": undefined,
              "toolCallId": "toolCallId",
              "toolName": "toolName",
              "type": "tool-result",
            },
          ],
          "providerOptions": undefined,
          "role": "tool",
        }
      `);
    });

    it('should map deprecated media type to image-data', () => {
      const result = convertToLanguageModelMessage({
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'toolName',
              toolCallId: 'toolCallId',
              output: {
                type: 'content',
                value: [
                  { type: 'media', data: 'dGVzdA==', mediaType: 'image/png' },
                ],
              },
            },
          ],
        },
        downloadedAssets: {},
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "output": {
                "type": "content",
                "value": [
                  {
                    "data": "dGVzdA==",
                    "mediaType": "image/png",
                    "type": "image-data",
                  },
                ],
              },
              "providerOptions": undefined,
              "toolCallId": "toolCallId",
              "toolName": "toolName",
              "type": "tool-result",
            },
          ],
          "providerOptions": undefined,
          "role": "tool",
        }
      `);
    });

    it('should map deprecated media type to file-data', () => {
      const result = convertToLanguageModelMessage({
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'toolName',
              toolCallId: 'toolCallId',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'media',
                    data: 'dGVzdA==',
                    mediaType: 'application/pdf',
                  },
                ],
              },
            },
          ],
        },
        downloadedAssets: {},
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "output": {
                "type": "content",
                "value": [
                  {
                    "data": "dGVzdA==",
                    "mediaType": "application/pdf",
                    "type": "file-data",
                  },
                ],
              },
              "providerOptions": undefined,
              "toolCallId": "toolCallId",
              "toolName": "toolName",
              "type": "tool-result",
            },
          ],
          "providerOptions": undefined,
          "role": "tool",
        }
      `);
    });
  });
});
