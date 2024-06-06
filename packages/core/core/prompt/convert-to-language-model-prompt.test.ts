import { convertToLanguageModelMessage } from './convert-to-language-model-prompt';

describe('convertToLanguageModelMessage', () => {
  describe('assistant message', () => {
    it('should ignore empty text parts', async () => {
      const result = convertToLanguageModelMessage({
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
      });

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
});
