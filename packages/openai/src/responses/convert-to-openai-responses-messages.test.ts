import { convertToOpenAIResponsesMessages } from './convert-to-openai-responses-messages';

describe('convertToOpenAIResponsesMessages', () => {
  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      });

      expect(result).toEqual([
        { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
      ]);
    });
  });

  describe('assistant messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      expect(result).toEqual([
        {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello' }],
        },
      ]);
    });
  });
});
