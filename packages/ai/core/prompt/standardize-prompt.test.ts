import { InvalidPromptError } from '@ai-sdk/provider';
import { standardizePrompt } from './standardize-prompt';

describe('message prompt', () => {
  it('should throw InvalidPromptError when system message has parts', async () => {
    await expect(async () => {
      await standardizePrompt({
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
    }).rejects.toThrow(InvalidPromptError);
  });

  it('should throw InvalidPromptError when messages array is empty', async () => {
    await expect(async () => {
      await standardizePrompt({
        prompt: {
          messages: [],
        },
        tools: undefined,
      });
    }).rejects.toThrow(InvalidPromptError);
  });
});
