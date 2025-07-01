import { describe, it, expect } from 'vitest';
import { convertToAdaptiveChatMessages } from './convert-to-adaptive-chat-messages';

const base64Image = 'AAECAw==';
const base64Audio = 'AAECAw==';
const base64Pdf = 'AQIDBAU=';

// Helper for URL
const exampleUrl = new URL('https://example.com/document.pdf');

describe('convertToAdaptiveChatMessages', () => {
  describe('system messages', () => {
    it('should forward system messages', () => {
      const { messages, warnings } = convertToAdaptiveChatMessages({
        prompt: [{ role: 'system', content: 'You are a helpful assistant.' }],
      });
      expect(messages).toEqual([
        { role: 'system', content: 'You are a helpful assistant.' },
      ]);
      expect(warnings).toEqual([]);
    });

    it('should remove system messages when requested', () => {
      const { messages, warnings } = convertToAdaptiveChatMessages({
        prompt: [{ role: 'system', content: 'You are a helpful assistant.' }],
        systemMessageMode: 'remove',
      });
      expect(messages).toEqual([]);
      expect(warnings).toEqual([
        {
          type: 'other',
          message: 'system messages are removed for this model',
        },
      ]);
    });
  });

  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      });
      expect(messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should convert messages with image parts', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              {
                type: 'file',
                mediaType: 'image/png',
                data: base64Image,
              },
            ],
          },
        ],
      });
      expect(messages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AAECAw==' },
            },
          ],
        },
      ]);
    });

    it('should convert messages with image file part as URL', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: exampleUrl,
              },
            ],
          },
        ],
      });
      expect(messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: exampleUrl.toString() },
            },
          ],
        },
      ]);
    });

    it('should add audio content for audio/wav file parts', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'audio/wav',
                data: base64Audio,
              },
            ],
          },
        ],
      });
      expect(messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: base64Audio, format: 'wav' },
            },
          ],
        },
      ]);
    });

    it('should add audio content for audio/mp3 file parts', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'audio/mp3',
                data: base64Audio,
              },
            ],
          },
        ],
      });
      expect(messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: base64Audio, format: 'mp3' },
            },
          ],
        },
      ]);
    });

    it('should add audio content for audio/mpeg file parts', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'audio/mpeg',
                data: base64Audio,
              },
            ],
          },
        ],
      });
      expect(messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: base64Audio, format: 'mp3' },
            },
          ],
        },
      ]);
    });

    it('should convert messages with PDF file parts', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: base64Pdf,
                filename: 'document.pdf',
              },
            ],
          },
        ],
      });
      expect(messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'document.pdf',
                file_data: 'data:application/pdf;base64,AQIDBAU=',
              },
            },
          ],
        },
      ]);
    });

    it('should use default filename for PDF file parts when not provided', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: base64Pdf,
              },
            ],
          },
        ],
      });
      expect(messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'part-0.pdf',
                file_data: 'data:application/pdf;base64,AQIDBAU=',
              },
            },
          ],
        },
      ]);
    });

    it('should throw error for unsupported file types', () => {
      expect(() =>
        convertToAdaptiveChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'text/plain',
                  data: base64Pdf,
                },
              ],
            },
          ],
        }),
      ).toThrow('file part media type text/plain');
    });

    it('should throw error for file URLs for PDF', () => {
      expect(() =>
        convertToAdaptiveChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'application/pdf',
                  data: exampleUrl,
                },
              ],
            },
          ],
        }),
      ).toThrow('PDF file parts with URLs');
    });

    it('should throw error for file URLs for audio', () => {
      expect(() =>
        convertToAdaptiveChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'audio/wav',
                  data: exampleUrl,
                },
              ],
            },
          ],
        }),
      ).toThrow('Audio file parts with URLs');
    });
  });

  describe('assistant and tool messages', () => {
    it('should stringify arguments to tool calls', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                input: { foo: 'bar123' },
                toolCallId: 'quux',
                toolName: 'thwomp',
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'quux',
                toolName: 'thwomp',
                output: { type: 'json', value: { oof: '321rab' } },
              },
            ],
          },
        ],
      });
      expect(messages).toEqual([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              type: 'function',
              id: 'quux',
              function: {
                name: 'thwomp',
                arguments: JSON.stringify({ foo: 'bar123' }),
              },
            },
          ],
        },
        {
          role: 'tool',
          content: JSON.stringify({ oof: '321rab' }),
          tool_call_id: 'quux',
        },
      ]);
    });

    it('should handle different tool output types', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'text-tool',
                toolName: 'text-tool',
                output: { type: 'text', value: 'Hello world' },
              },
              {
                type: 'tool-result',
                toolCallId: 'error-tool',
                toolName: 'error-tool',
                output: { type: 'error-text', value: 'Something went wrong' },
              },
              {
                type: 'tool-result',
                toolCallId: 'json-tool',
                toolName: 'json-tool',
                output: { type: 'json', value: { foo: 'bar' } },
              },
              {
                type: 'tool-result',
                toolCallId: 'content-tool',
                toolName: 'content-tool',
                output: {
                  type: 'content',
                  value: [{ type: 'text', text: 'hi' }],
                },
              },
            ],
          },
        ],
      });
      expect(messages).toEqual([
        {
          role: 'tool',
          content: 'Hello world',
          tool_call_id: 'text-tool',
        },
        {
          role: 'tool',
          content: 'Something went wrong',
          tool_call_id: 'error-tool',
        },
        {
          role: 'tool',
          content: JSON.stringify({ foo: 'bar' }),
          tool_call_id: 'json-tool',
        },
        {
          role: 'tool',
          content: JSON.stringify([{ type: 'text', text: 'hi' }]),
          tool_call_id: 'content-tool',
        },
      ]);
    });

    it('should handle assistant text and tool calls together', () => {
      const { messages } = convertToAdaptiveChatMessages({
        prompt: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Here is a tool call:' },
              {
                type: 'tool-call',
                input: { foo: 'bar' },
                toolCallId: 'call-1',
                toolName: 'tool-1',
              },
            ],
          },
        ],
      });
      expect(messages).toEqual([
        {
          role: 'assistant',
          content: 'Here is a tool call:',
          tool_calls: [
            {
              type: 'function',
              id: 'call-1',
              function: {
                name: 'tool-1',
                arguments: JSON.stringify({ foo: 'bar' }),
              },
            },
          ],
        },
      ]);
    });
  });
});
