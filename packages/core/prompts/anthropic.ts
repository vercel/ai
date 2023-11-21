import { Message } from '../shared/types';

/**
 * A prompt constructor for Anthropic models.
 * Does not support `function` messages.
 * @see https://docs.anthropic.com/claude/reference/getting-started-with-the-api
 */
export function experimental_buildAnthropicPrompt(
  messages: Pick<Message, 'content' | 'role'>[],
) {
  return (
    messages.map(({ content, role }) => {
      if (role === 'user') {
        return `\n\nHuman: ${content}`;
      } else {
        return `\n\nAssistant: ${content}`;
      }
    }) + '\n\nAssistant:'
  );
}
