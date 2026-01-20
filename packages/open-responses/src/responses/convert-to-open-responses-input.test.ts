import { convertToOpenResponsesInput } from './convert-to-open-responses-input';
import { describe, it, expect } from 'vitest';

describe('convertToOpenResponsesInput', () => {
  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = await convertToOpenResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello",
                "type": "input_text",
              },
            ],
            "role": "user",
            "type": "message",
          },
        ]
      `);
    });
  });

  describe('assistant messages', () => {
    it('should convert messages with only a text part to output_text content', async () => {
      const result = await convertToOpenResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello from assistant' }],
          },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello from assistant",
                "type": "output_text",
              },
            ],
            "role": "assistant",
            "type": "message",
          },
        ]
      `);
    });

    it('should convert messages with multiple text parts', async () => {
      const result = await convertToOpenResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'First part' },
              { type: 'text', text: 'Second part' },
            ],
          },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "First part",
                "type": "output_text",
              },
              {
                "text": "Second part",
                "type": "output_text",
              },
            ],
            "role": "assistant",
            "type": "message",
          },
        ]
      `);
    });
  });

  describe('message chains', () => {
    it('should convert user - assistant - user message chain', async () => {
      const result = await convertToOpenResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is the capital of France?' }],
          },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'The capital of France is Paris.' },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'And what about Germany?' }],
          },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "What is the capital of France?",
                "type": "input_text",
              },
            ],
            "role": "user",
            "type": "message",
          },
          {
            "content": [
              {
                "text": "The capital of France is Paris.",
                "type": "output_text",
              },
            ],
            "role": "assistant",
            "type": "message",
          },
          {
            "content": [
              {
                "text": "And what about Germany?",
                "type": "input_text",
              },
            ],
            "role": "user",
            "type": "message",
          },
        ]
      `);
    });
  });
});
