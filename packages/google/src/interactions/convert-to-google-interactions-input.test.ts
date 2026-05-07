import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertToGoogleInteractionsInput } from './convert-to-google-interactions-input';

describe('convertToGoogleInteractionsInput', () => {
  describe('text-only prompts', () => {
    it('emits a single-turn array of text content blocks', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello, how are you?' }],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "text": "Hello, how are you?",
              "type": "text",
            },
          ],
          "systemInstruction": undefined,
          "warnings": [],
        }
      `);
    });

    it('extracts system messages into systemInstruction', () => {
      const prompt: LanguageModelV4Prompt = [
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hi' }],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.systemInstruction).toBe('You are a helpful assistant.');
    });
  });

  describe('image file parts', () => {
    it('maps a base64 / Uint8Array data part to an inline image block', () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: bytes },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "text": "Describe this",
              "type": "text",
            },
            {
              "data": "AQIDBA==",
              "mime_type": "image/png",
              "type": "image",
            },
          ],
          "systemInstruction": undefined,
          "warnings": [],
        }
      `);
    });

    it('passes a base64-string data part through untouched', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/jpeg',
              data: { type: 'data', data: 'SGVsbG8=' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        {
          type: 'image',
          data: 'SGVsbG8=',
          mime_type: 'image/jpeg',
        },
      ]);
    });

    it('maps a url data part to an image block with `uri` (URL passthrough)', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'url',
                url: new URL('https://example.com/cat.png'),
              },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "text": "Describe this",
              "type": "text",
            },
            {
              "mime_type": "image/png",
              "type": "image",
              "uri": "https://example.com/cat.png",
            },
          ],
          "systemInstruction": undefined,
          "warnings": [],
        }
      `);
    });

    it('omits mime_type for url parts when only a top-level mediaType is given', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image',
              data: {
                type: 'url',
                url: new URL('https://example.com/cat.png'),
              },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        {
          type: 'image',
          uri: 'https://example.com/cat.png',
        },
      ]);
    });

    it('maps a reference data part to an image block with the resolved Files API URI', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'reference',
                reference: {
                  google:
                    'https://generativelanguage.googleapis.com/v1beta/files/abc123',
                },
              },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "text": "Describe this",
              "type": "text",
            },
            {
              "mime_type": "image/png",
              "type": "image",
              "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc123",
            },
          ],
          "systemInstruction": undefined,
          "warnings": [],
        }
      `);
    });

    it('throws when a reference does not contain a `google` entry', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'reference',
                reference: { openai: 'file-abc' },
              },
            },
          ],
        },
      ];

      expect(() => convertToGoogleInteractionsInput({ prompt })).toThrow();
    });

    it('threads mediaResolution onto inline image blocks', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: 'SGVsbG8=' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({
        prompt,
        mediaResolution: 'high',
      });

      expect(result.input).toEqual([
        {
          type: 'image',
          data: 'SGVsbG8=',
          mime_type: 'image/png',
          resolution: 'high',
        },
      ]);
    });
  });

  describe('document file parts', () => {
    it('maps an application/pdf data part to a document block', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: { type: 'data', data: bytes },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        {
          type: 'document',
          data: 'AQID',
          mime_type: 'application/pdf',
        },
      ]);
    });

    it('passes a base64-string PDF data part through as a document block', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: { type: 'data', data: 'JVBERi0=' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        {
          type: 'document',
          data: 'JVBERi0=',
          mime_type: 'application/pdf',
        },
      ]);
    });

    it('maps a url PDF data part to a document block with `uri` (URL passthrough)', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this' },
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: {
                type: 'url',
                url: new URL('https://example.com/paper.pdf'),
              },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "text": "Summarize this",
              "type": "text",
            },
            {
              "mime_type": "application/pdf",
              "type": "document",
              "uri": "https://example.com/paper.pdf",
            },
          ],
          "systemInstruction": undefined,
          "warnings": [],
        }
      `);
    });

    it('maps a reference PDF data part to a document block with the resolved Files API URI', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: {
                type: 'reference',
                reference: {
                  google:
                    'https://generativelanguage.googleapis.com/v1beta/files/doc-xyz',
                },
              },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        {
          type: 'document',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/doc-xyz',
          mime_type: 'application/pdf',
        },
      ]);
    });

    it('collapses a text-data document part to an inline text block (no text+data on the wire)', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: { type: 'text', text: 'extracted PDF body' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        { type: 'text', text: 'extracted PDF body' },
      ]);
    });
  });

  describe('video file parts', () => {
    it('passes a YouTube URL through as a video block with `uri`', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this video' },
            {
              type: 'file',
              mediaType: 'video/*',
              data: {
                type: 'url',
                url: new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
              },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "text": "Summarize this video",
              "type": "text",
            },
            {
              "type": "video",
              "uri": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            },
          ],
          "systemInstruction": undefined,
          "warnings": [],
        }
      `);
    });

    it('passes a youtu.be short URL through as a video block', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'video/mp4',
              data: {
                type: 'url',
                url: new URL('https://youtu.be/abc123'),
              },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        {
          type: 'video',
          uri: 'https://youtu.be/abc123',
          mime_type: 'video/mp4',
        },
      ]);
    });

    it('maps a video data part to an inline video block', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'video/mp4',
              data: { type: 'data', data: new Uint8Array([5, 6, 7]) },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        {
          type: 'video',
          data: 'BQYH',
          mime_type: 'video/mp4',
        },
      ]);
    });

    it('maps a video reference part to a video block with the resolved Files API URI', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'video/mp4',
              data: {
                type: 'reference',
                reference: {
                  google:
                    'https://generativelanguage.googleapis.com/v1beta/files/vid-xyz',
                },
              },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        {
          type: 'video',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/vid-xyz',
          mime_type: 'video/mp4',
        },
      ]);
    });
  });

  describe('text file parts', () => {
    it('collapses a text-data file part into an inline text block', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'text/plain',
              data: { type: 'text', text: 'inline text content' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        {
          type: 'text',
          text: 'inline text content',
        },
      ]);
    });

    it('merges an inline text-data file part with an adjacent text part', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Please review:' },
            {
              type: 'file',
              mediaType: 'text/plain',
              data: { type: 'text', text: 'inline body' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        { type: 'text', text: 'Please review:\n\ninline body' },
      ]);
    });

    it('does not merge a text part across a non-text part', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'before' },
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: 'AQID' },
            },
            {
              type: 'file',
              mediaType: 'text/plain',
              data: { type: 'text', text: 'after' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([
        { type: 'text', text: 'before' },
        { type: 'image', data: 'AQID', mime_type: 'image/png' },
        { type: 'text', text: 'after' },
      ]);
    });

    it('merges three adjacent text-derived parts into one', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'a' },
            { type: 'text', text: 'b' },
            {
              type: 'file',
              mediaType: 'text/markdown',
              data: { type: 'text', text: 'c' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([{ type: 'text', text: 'a\n\nb\n\nc' }]);
    });
  });

  describe('assistant tool-call parts', () => {
    it('emits a function_call content block from an assistant tool-call part with object input', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: "What's the weather in NYC?" }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_abc',
              toolName: 'getWeather',
              input: { location: 'New York' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "What's the weather in NYC?",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "content": [
              {
                "arguments": {
                  "location": "New York",
                },
                "id": "call_abc",
                "name": "getWeather",
                "type": "function_call",
              },
            ],
            "role": "model",
          },
        ]
      `);
    });

    it('parses a stringified tool-call input safely', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hi' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_abc',
              toolName: 'getWeather',
              input: '{"location":"Boston"}',
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });
      const turns = result.input as Array<{ content: Array<unknown> }>;
      const fnCall = turns[1].content[0] as {
        arguments: Record<string, unknown>;
      };
      expect(fnCall.arguments).toEqual({ location: 'Boston' });
    });

    it('round-trips a function_call signature via providerMetadata.google.signature', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hi' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_abc',
              toolName: 'getWeather',
              input: { location: 'NYC' },
              providerOptions: {
                google: { signature: 'sig-xyz' },
              },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });
      const turns = result.input as Array<{ content: Array<unknown> }>;
      const fnCall = turns[1].content[0] as { signature?: string };
      expect(fnCall.signature).toBe('sig-xyz');
    });
  });

  describe('assistant file parts', () => {
    it('emits an image content block from an assistant inline-data file part (round-trips a generated image)', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'generate a cat' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: 'base64data' },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'now make it red' }],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.warnings).toEqual([]);
      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "generate a cat",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "content": [
              {
                "data": "base64data",
                "mime_type": "image/png",
                "type": "image",
              },
            ],
            "role": "model",
          },
          {
            "content": [
              {
                "text": "now make it red",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('emits an image content block from an assistant url-data file part', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'assistant',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'url',
                url: new URL('https://example.com/cat.png'),
              },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });
      const turns = result.input as Array<{ content: Array<unknown> }>;
      expect(turns[0].content[0]).toEqual({
        type: 'image',
        uri: 'https://example.com/cat.png',
        mime_type: 'image/png',
      });
    });
  });

  describe('tool-result messages', () => {
    it('maps a text tool result to a function_result block on a user turn', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is the weather?' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_abc',
              toolName: 'getWeather',
              input: { location: 'NYC' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_abc',
              toolName: 'getWeather',
              output: { type: 'text', value: 'It is sunny.' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "What is the weather?",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "content": [
              {
                "arguments": {
                  "location": "NYC",
                },
                "id": "call_abc",
                "name": "getWeather",
                "type": "function_call",
              },
            ],
            "role": "model",
          },
          {
            "content": [
              {
                "call_id": "call_abc",
                "name": "getWeather",
                "result": "It is sunny.",
                "type": "function_result",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('serializes a json tool result to a stringified payload', () => {
      const prompt: LanguageModelV4Prompt = [
        { role: 'user', content: [{ type: 'text', text: 'q' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_x',
              toolName: 'getWeather',
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_x',
              toolName: 'getWeather',
              output: {
                type: 'json',
                value: { temperature: 72, condition: 'sunny' },
              },
            },
          ],
        },
      ];
      const result = convertToGoogleInteractionsInput({ prompt });
      const turns = result.input as Array<{ content: Array<unknown> }>;
      const fr = turns[2].content[0] as { result: unknown };
      expect(fr.result).toBe('{"temperature":72,"condition":"sunny"}');
    });

    it('maps an error-text tool result to is_error: true', () => {
      const prompt: LanguageModelV4Prompt = [
        { role: 'user', content: [{ type: 'text', text: 'q' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_x',
              toolName: 'getWeather',
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_x',
              toolName: 'getWeather',
              output: { type: 'error-text', value: 'API timeout' },
            },
          ],
        },
      ];
      const result = convertToGoogleInteractionsInput({ prompt });
      const turns = result.input as Array<{ content: Array<unknown> }>;
      expect(turns[2].content[0]).toEqual({
        type: 'function_result',
        call_id: 'call_x',
        name: 'getWeather',
        is_error: true,
        result: 'API timeout',
      });
    });

    it('maps a content output with mixed text and image parts to an array result', () => {
      const prompt: LanguageModelV4Prompt = [
        { role: 'user', content: [{ type: 'text', text: 'q' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_x',
              toolName: 'lookup',
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_x',
              toolName: 'lookup',
              output: {
                type: 'content',
                value: [
                  { type: 'text', text: 'Here is the result:' },
                  {
                    type: 'file',
                    mediaType: 'image/png',
                    data: { type: 'data', data: 'AQID' },
                  },
                ],
              },
            },
          ],
        },
      ];
      const result = convertToGoogleInteractionsInput({ prompt });
      const turns = result.input as Array<{ content: Array<unknown> }>;
      expect(turns[2].content[0]).toMatchInlineSnapshot(`
        {
          "call_id": "call_x",
          "name": "lookup",
          "result": [
            {
              "text": "Here is the result:",
              "type": "text",
            },
            {
              "data": "AQID",
              "mime_type": "image/png",
              "type": "image",
            },
          ],
          "type": "function_result",
        }
      `);
    });

    it('emits a warning when a content tool-result contains a non-image file part', () => {
      const prompt: LanguageModelV4Prompt = [
        { role: 'user', content: [{ type: 'text', text: 'q' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_x',
              toolName: 'lookup',
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_x',
              toolName: 'lookup',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'file',
                    mediaType: 'application/pdf',
                    data: { type: 'data', data: 'AQID' },
                  },
                ],
              },
            },
          ],
        },
      ];
      const result = convertToGoogleInteractionsInput({ prompt });
      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "message": "google.interactions: tool-result file with mediaType "application/pdf" is not supported (Interactions \`function_result.result\` accepts only text and image content); part dropped.",
            "type": "other",
          },
        ]
      `);
    });
  });

  describe('compaction (previousInteractionId)', () => {
    const PREV_ID = 'v1_prev-interaction-abc';

    it('drops an assistant turn whose parts carry the matching interactionId', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'first user input' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'old answer',
              providerOptions: {
                google: { interactionId: PREV_ID },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'follow-up user input' }],
        },
      ];
      const result = convertToGoogleInteractionsInput({
        prompt,
        previousInteractionId: PREV_ID,
      });
      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "first user input",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "content": [
              {
                "text": "follow-up user input",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('keeps an assistant turn from a different interaction', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'first user input' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'unrelated old answer',
              providerOptions: {
                google: { interactionId: 'some-other-interaction' },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'follow-up user input' }],
        },
      ];
      const result = convertToGoogleInteractionsInput({
        prompt,
        previousInteractionId: PREV_ID,
      });
      const turns = result.input as Array<{
        role: string;
        content: Array<unknown>;
      }>;
      expect(turns).toHaveLength(3);
      expect(turns[1].role).toBe('model');
    });

    it('drops the matching assistant tool-call turn AND its paired tool-result message', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'q1' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_old',
              toolName: 'getWeather',
              input: { location: 'Boston' },
              providerOptions: {
                google: { interactionId: PREV_ID },
              },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_old',
              toolName: 'getWeather',
              output: { type: 'text', value: 'sunny' },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'q2' }],
        },
      ];
      const result = convertToGoogleInteractionsInput({
        prompt,
        previousInteractionId: PREV_ID,
      });
      const turns = result.input as Array<{
        role: string;
        content: Array<{ type: string }>;
      }>;
      expect(turns.map(t => t.role)).toEqual(['user', 'user']);
      expect(turns[0].content[0]).toMatchObject({
        type: 'text',
        text: 'q1',
      });
      expect(turns[1].content[0]).toMatchObject({
        type: 'text',
        text: 'q2',
      });
    });

    it('does not compact when store=false (incoherent combo) and emits a warning', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'q1' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'old answer',
              providerOptions: {
                google: { interactionId: PREV_ID },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'q2' }],
        },
      ];
      const result = convertToGoogleInteractionsInput({
        prompt,
        previousInteractionId: PREV_ID,
        store: false,
      });
      const turns = result.input as Array<{ role: string }>;
      expect(turns).toHaveLength(3);
      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "message": "google.interactions: providerOptions.google.previousInteractionId was set together with store: false. These are incoherent (the prior interaction cannot be referenced when nothing was stored on the server); the full history will be sent and previous_interaction_id will still be emitted.",
            "type": "other",
          },
        ]
      `);
    });

    it('reduces a stateful turn-2 wire body to only the new user message', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'first user input' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: '',
              providerOptions: {
                google: { interactionId: PREV_ID, signature: 'sig-1' },
              },
            },
            {
              type: 'text',
              text: 'first model answer',
              providerOptions: {
                google: { interactionId: PREV_ID },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'follow-up' }],
        },
      ];
      const result = convertToGoogleInteractionsInput({
        prompt,
        previousInteractionId: PREV_ID,
      });
      // After compaction, only "first user input" + "follow-up" remain. The
      // single-turn fast-path doesn't kick in because two user turns survive,
      // so we still get the Array<Turn> shape — but no model turn.
      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "first user input",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "content": [
              {
                "text": "follow-up",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('round-trips a thought signature on a turn-1 reasoning output back onto the turn-2 wire block', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'q' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: '',
              providerOptions: {
                google: { signature: 'thought-sig-XYZ' },
              },
            },
            {
              type: 'text',
              text: 'a',
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'q2' }],
        },
      ];
      const result = convertToGoogleInteractionsInput({ prompt });
      const turns = result.input as Array<{ content: Array<unknown> }>;
      const modelContent = turns[1].content as Array<{
        type: string;
        signature?: string;
      }>;
      expect(modelContent[0]).toMatchObject({
        type: 'thought',
        signature: 'thought-sig-XYZ',
      });
    });
  });

  describe('stateless multi-turn (store: false, no previousInteractionId)', () => {
    it('forwards full history verbatim and emits no warnings', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What are the three largest cities in Spain?',
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Madrid, Barcelona, Valencia.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is the most famous landmark in the second one?',
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({
        prompt,
        store: false,
      });

      expect(result.warnings).toEqual([]);
      const turns = result.input as Array<{
        role: string;
        content: Array<{ type: string; text?: string }>;
      }>;
      expect(turns).toHaveLength(3);
      expect(turns.map(t => t.role)).toEqual(['user', 'model', 'user']);
      expect(turns[0].content[0]).toMatchObject({
        type: 'text',
        text: 'What are the three largest cities in Spain?',
      });
      expect(turns[1].content[0]).toMatchObject({
        type: 'text',
        text: 'Madrid, Barcelona, Valencia.',
      });
      expect(turns[2].content[0]).toMatchObject({
        type: 'text',
        text: 'What is the most famous landmark in the second one?',
      });
    });

    it('does not compact assistant turns even when they carry a stale interactionId', () => {
      const STALE_ID = 'v1_stale-interaction';
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'q1' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'a1',
              providerOptions: {
                google: { interactionId: STALE_ID },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'q2' }],
        },
      ];

      const result = convertToGoogleInteractionsInput({
        prompt,
        store: false,
      });

      expect(result.warnings).toEqual([]);
      const turns = result.input as Array<{ role: string }>;
      expect(turns).toHaveLength(3);
      expect(turns.map(t => t.role)).toEqual(['user', 'model', 'user']);
    });
  });

  describe('unsupported file media types', () => {
    it('emits a warning and drops the part when media type is unrecognized', () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hi' },
            {
              type: 'file',
              mediaType: 'unknown/blob',
              data: { type: 'data', data: 'AQID' },
            },
          ],
        },
      ];

      const result = convertToGoogleInteractionsInput({ prompt });

      expect(result.input).toEqual([{ type: 'text', text: 'Hi' }]);
      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "message": "google.interactions: unsupported file media type "unknown/blob"; part dropped.",
            "type": "other",
          },
        ]
      `);
    });
  });
});
