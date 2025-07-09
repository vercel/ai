import { convertToPerplexityMessages } from './convert-to-perplexity-messages';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';

describe('convertToPerplexityMessages', () => {
  describe('system messages', () => {
    it('should convert a system message with text content', () => {
      expect(
        convertToPerplexityMessages([
          {
            role: 'system',
            content: 'System initialization',
          },
        ]),
      ).toMatchSnapshot();
    });
  });

  describe('user messages', () => {
    it('should convert a user message with text parts', () => {
      expect(
        convertToPerplexityMessages([
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'text', text: 'World' },
            ],
          },
        ]),
      ).toMatchSnapshot();
    });

    it('should convert a user message with image parts', () => {
      expect(
        convertToPerplexityMessages([
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello ' },
              {
                type: 'file',
                data: new Uint8Array([0, 1, 2, 3]),
                mediaType: 'image/png',
              },
            ],
          },
        ]),
      ).toMatchSnapshot();
    });
  });

  describe('assistant messages', () => {
    it('should convert an assistant message with text content', () => {
      expect(
        convertToPerplexityMessages([
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Assistant reply' }],
          },
        ]),
      ).toMatchSnapshot();
    });
  });

  describe('tool messages', () => {
    it('should throw an error for tool messages', () => {
      expect(() => {
        convertToPerplexityMessages([
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'dummy-tool-call-id',
                toolName: 'dummy-tool-name',
                output: { type: 'text', value: 'This should fail' },
              },
            ],
          },
        ]);
      }).toThrow(UnsupportedFunctionalityError);
    });
  });
});
