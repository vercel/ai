import { AIPrompt } from './ai-prompt';
import type { SimpleMessage } from '../shared/types';

// We extend AIPrompt to get a clean signature on the return for downstream callers.
export interface Anthropic_AIPrompt extends AIPrompt {
  toPrompt(): string;
}

/**
 * Claude has an interesting way of dealing with prompts. Prompt formatting is discussed briefly at https://docs.anthropic.com/claude/reference/getting-started-with-the-api
 * However, there is nothing in the Anthropic Documentation that discusses what to do with Chat-type prompting.
 * We'll go a little "off-book" with a prompt style mirroring a recent publication by Amazon AWS: (https://github.com/aws-samples/amazon-bedrock-workshop/blob/main/04_Chatbot/00_Chatbot_Claude.ipynb)
 *
 * Here is their suggested approach:
 *
 * Human: The following is a friendly conversation between a human and an AI.
 * The AI is talkative and provides lots of specific details from its context. If the AI does not know
 * the answer to a question, it truthfully says it does not know.
 *
 * Current conversation:
 * <conversation_history>
 * {history}
 * </conversation_history>
 *
 * Here is the human's next reply:
 * <human_reply>
 * {input}
 * </human_reply>
 *
 * Assistant:
 *
 * Creates an AnthropicPrompt object that can be used to construct a prompt string.
 * @param messages An array of SimpleMessage objects containing the content and role of each message to be included in the prompt.
 * @returns An AIPrompt object with methods to build and retrieve the prompt string.
 */
export function AnthropicPrompt(messages: SimpleMessage[]): Anthropic_AIPrompt {
  let promptText = '';
  let promptStart = `Human:`;
  let systemContent = '';
  let conversationHistory = 'No conversation history yet.';
  let humanReply = '';
  let promptEnd = '\n\nAssistant:';
  let isConversationHistoryStarted = false;
  // So, the prompt will be constructed as follows:
  //   promptStart + systemsContent + '<conversationHistory>' + conversationHistory + '</conversationHistory>' + '<humanReply>' + humanReply + '</humanReply>' + promptEnd
  // with some newlines.

  /**
   * Adds a message to the prompt text.
   * @param content The content of the message to be added.
   * @param role The role of the message sender. Defaults to 'system'.
   * @param location The location of the message in the prompt text. Defaults to 'after'.
   */
  const addMessage = (
    content: string,
    role: 'user' | 'assistant' | 'system' | 'function' = 'system',
    location: 'before' | 'after' = 'after',
  ): void => {
    //if content is null we'll just skip the message.
    if (content === null) return;

    if (role === 'function') {
      //skip function messages for prompts as of now
    } else if (role === 'system') {
      systemContent =
        location === 'before'
          ? content + systemContent
          : systemContent + content;
    } else if (role === 'user') {
      // this part is a little tricky. The latest role=user message becomes the single humanReply value. Any existing humanReply value needs to be bumped into conversationhistory at its end.
      if (isConversationHistoryStarted === false) {
        conversationHistory = '';
        isConversationHistoryStarted = true;
      }
      conversationHistory = conversationHistory + '\n' + humanReply;
      humanReply = 'Human: ' + content;
    } else if (role === 'assistant') {
      if (isConversationHistoryStarted === false) {
        conversationHistory = '';
        isConversationHistoryStarted = true;
      }
      conversationHistory =
        conversationHistory + '\n' + 'Assistant: ' + content;
    }
    //and now we need to update the promptText
    promptText =
      promptStart +
      systemContent +
      '\n\n<conversationHistory>\n' +
      conversationHistory +
      '\n</conversationHistory>\n\n<humanReply>\n' +
      humanReply +
      '\n</humanReply>' +
      promptEnd;
  };

  /**
   * Initializes the `promptText` string by iterating over the array of objects (messages) provided.
   * @param messages An array of SimpleMessage objects containing the content and role of each message to be included in the prompt.
   * @returns The initial prompt string for external use, if needed.
   */
  const buildPrompt = (messages: SimpleMessage[]): string => {
    messages.forEach(({ content, role }) => {
      addMessage(content, role, 'after');
    });
    return promptText;
  };

  buildPrompt(messages);

  /**
   * Returns the constructed prompt string.
   * @returns The prompt string.
   */
  const toPrompt = (): string => {
    return promptText;
  };

  return {
    buildPrompt,
    addMessage,
    toPrompt,
  };
}
