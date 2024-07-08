import { convertToLanguageModelMessage } from './convert-to-language-model-prompt';

describe('convertToLanguageModelMessage', () => {
  describe('user message', () => {
    describe('image parts', () => {
      it('should convert image string https url to URL object', async () => {
        const result = convertToLanguageModelMessage({
          role: 'user',
          name: 'admin',
          content: [
            {
              type: 'image',
              image: 'https://example.com/image.jpg',
            },
          ],
        });

        expect(result).toEqual({
          role: 'user',
          name: 'admin',
          content: [
            {
              type: 'image',
              image: new URL('https://example.com/image.jpg'),
            },
          ],
        });
      });

      it('should convert image string data url to base64 content', async () => {
        const result = convertToLanguageModelMessage({
          role: 'user',
          name: 'image-submitter',
          content: [
            {
              type: 'image',
              image: 'data:image/jpg;base64,dGVzdA==',
            },
          ],
        });

        expect(result).toEqual({
          role: 'user',
          name: 'image-submitter',
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
  });

  describe('assistant message', () => {
    describe('text parts', () => {
      it('should ignore empty text parts', async () => {
        const result = convertToLanguageModelMessage({
          role: 'assistant',
          name: 'agent-1',
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
          name: 'agent-1',
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
});
