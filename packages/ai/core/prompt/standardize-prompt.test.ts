import { InvalidPromptError } from '@ai-sdk/provider';
import { standardizePrompt } from './standardize-prompt';

describe('message prompt', () => {
  it('should throw InvalidPromptError when system message has parts', () => {
    expect(() => {
      standardizePrompt({
        prompt: {
          messages: [
            {
              role: 'system',
              content: [{ type: 'text', text: 'test' }] as any,
            },
          ],
        },
        tools: undefined,
      });
    }).toThrow(InvalidPromptError);
  });

  it('should throw InvalidPromptError when messages array is empty', () => {
    expect(() => {
      standardizePrompt({
        prompt: {
          messages: [],
        },
        tools: undefined,
      });
    }).toThrow(InvalidPromptError);
  });
});
