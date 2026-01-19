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

      expect(result.input).toEqual([
        { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
      ]);
    });
  });
});
