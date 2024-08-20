import { InvalidPromptError } from '@ai-sdk/provider';
import { validatePrompt } from './validate-prompt';

describe('message prompt', () => {
  it('should throw InvalidPromptError when system message has parts', () => {
    expect(() => {
      validatePrompt({
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'test' }] as any,
          },
        ],
      });
    }).toThrow(InvalidPromptError);
  });
});
