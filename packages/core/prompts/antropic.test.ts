import { Message } from '@ai-sdk/ui-utils';
import { experimental_buildAnthropicPrompt } from './anthropic';

describe('experimental_buildAnthropicPrompt', () => {
  it('should correctly format messages', () => {
    const messages = [
      { content: 'Hello', role: 'user' },
      { content: 'Hi there', role: 'assistant' },
      { content: 'How are you?', role: 'user' },
      { content: 'I am fine, thank you.', role: 'assistant' },
    ] as Pick<Message, 'content' | 'role'>[];

    const result = experimental_buildAnthropicPrompt(messages);

    const expected =
      '\n\nHuman: Hello,\n\nAssistant: Hi there,\n\nHuman: How are you?,\n\nAssistant: I am fine, thank you.\n\nAssistant:';

    expect(result).toEqual(expected);
  });
});
