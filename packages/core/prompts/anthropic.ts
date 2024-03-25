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

/**
 * A prompt constructor for Anthropic V3 models which require Messages API.
 * Does not support message with image content
 * @see https://docs.anthropic.com/claude/reference/messages_post
 */
export function experimental_buildAnthropicMessages(
  messages: Pick<Message, 'content' | 'role'>[],
) {
  return messages.map(({ content, role }) => {
    if (!['assistant', 'user'].includes(role)) {
      throw new Error(`Cannot use ${role} on Anthropic V3 Messages API`);
    }
    return {
      role,
      content: [{ type: 'text', text: content }],
    };
  });
}
