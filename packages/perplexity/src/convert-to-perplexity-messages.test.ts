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

    it('should throw an error for user messages with image parts', () => {
      expect(() => {
        convertToPerplexityMessages([
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello ' },
              {
                type: 'image',
                image: new Uint8Array([0, 1, 2, 3]),
                mimeType: 'image/png',
              },
            ],
          },
        ]);
      }).toThrow(UnsupportedFunctionalityError);
    });

    it('should throw an error for user messages with file parts', () => {
      expect(() => {
        convertToPerplexityMessages([
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Document: ' },
              { type: 'file', data: 'dummy-data', mimeType: 'text/plain' },
            ],
          },
        ]);
      }).toThrow(UnsupportedFunctionalityError);
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

    it('should throw an error for assistant messages with tool-call parts', () => {
      expect(() => {
        convertToPerplexityMessages([
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                args: { key: 'value' },
                toolCallId: 'call-1',
                toolName: 'example-tool',
              },
            ],
          },
        ]);
      }).toThrow(UnsupportedFunctionalityError);
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
                result: 'This should fail',
              },
            ],
          },
        ]);
      }).toThrow(UnsupportedFunctionalityError);
    });
  });
});
