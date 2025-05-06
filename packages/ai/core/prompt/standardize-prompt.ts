import { InvalidPromptError } from '@ai-sdk/provider';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { Message } from '@ai-sdk/ui-utils';
import { z } from 'zod';
import { ToolSet } from '../generate-text/tool-set';
import { convertToCoreMessages } from './convert-to-core-messages';
import { CoreMessage, coreMessageSchema } from './message';
import { Prompt } from './prompt';

export type StandardizedPrompt = {
  /**
   * Original prompt type. This is forwarded to the providers and can be used
   * to write send raw text to providers that support it.
   */
  type: 'prompt' | 'messages';

  /**
   * System message.
   */
  system?: string;

  /**
   * Messages.
   */
  messages: CoreMessage[];
};

export function standardizePrompt<TOOLS extends ToolSet>({
  prompt,
  tools,
}: {
  prompt: Prompt;
  tools: undefined | TOOLS;
}): StandardizedPrompt {
  if (prompt.prompt == null && prompt.messages == null) {
    throw new InvalidPromptError({
      prompt,
      message: 'prompt or messages must be defined',
    });
  }

  if (prompt.prompt != null && prompt.messages != null) {
    throw new InvalidPromptError({
      prompt,
      message: 'prompt and messages cannot be defined at the same time',
    });
  }

  // validate that system is a string
  if (prompt.system != null && typeof prompt.system !== 'string') {
    throw new InvalidPromptError({
      prompt,
      message: 'system must be a string',
    });
  }

  // type: prompt
  if (prompt.prompt != null) {
    // validate that prompt is a string
    if (typeof prompt.prompt !== 'string') {
      throw new InvalidPromptError({
        prompt,
        message: 'prompt must be a string',
      });
    }

    return {
      type: 'prompt',
      system: prompt.system,
      messages: [
        {
          role: 'user',
          content: prompt.prompt,
        },
      ],
    };
  }

  // type: messages
  if (prompt.messages != null) {
    const promptType = detectPromptType(prompt.messages);

    const messages: CoreMessage[] =
      promptType === 'ui-messages'
        ? convertToCoreMessages(prompt.messages as Omit<Message, 'id'>[], {
            tools,
          })
        : (prompt.messages as CoreMessage[]);

    if (messages.length === 0) {
      throw new InvalidPromptError({
        prompt,
        message: 'messages must not be empty',
      });
    }

    const validationResult = safeValidateTypes({
      value: messages,
      schema: z.array(coreMessageSchema),
    });

    if (!validationResult.success) {
      throw new InvalidPromptError({
        prompt,
        message: [
          'message must be a CoreMessage or a UI message',
          `Validation error: ${validationResult.error.message}`,
        ].join('\n'),
        cause: validationResult.error,
      });
    }

    return {
      type: 'messages',
      messages,
      system: prompt.system,
    };
  }

  throw new Error('unreachable');
}

function detectPromptType(
  prompt: Array<any>,
): 'ui-messages' | 'messages' | 'other' {
  if (!Array.isArray(prompt)) {
    throw new InvalidPromptError({
      prompt,
      message: [
        'messages must be an array of CoreMessage or UIMessage',
        `Received non-array value: ${JSON.stringify(prompt)}`,
      ].join('\n'),
      cause: prompt,
    });
  }

  if (prompt.length === 0) {
    return 'messages';
  }

  const characteristics = prompt.map(detectSingleMessageCharacteristics);

  if (characteristics.some(c => c === 'has-ui-specific-parts')) {
    return 'ui-messages';
  }

  const nonMessageIndex = characteristics.findIndex(
    c => c !== 'has-core-specific-parts' && c !== 'message',
  );

  if (nonMessageIndex === -1) {
    return 'messages';
  }

  throw new InvalidPromptError({
    prompt,
    message: [
      'messages must be an array of CoreMessage or UIMessage',
      `Received message of type: "${characteristics[nonMessageIndex]}" at index ${nonMessageIndex}`,
      `messages[${nonMessageIndex}]: ${JSON.stringify(prompt[nonMessageIndex])}`,
    ].join('\n'),
    cause: prompt,
  });
}

function detectSingleMessageCharacteristics(
  message: any,
): 'has-ui-specific-parts' | 'has-core-specific-parts' | 'message' | 'other' {
  if (
    typeof message === 'object' &&
    message !== null &&
    (message.role === 'function' || // UI-only role
      message.role === 'data' || // UI-only role
      'toolInvocations' in message || // UI-specific field
      'parts' in message || // UI-specific field
      'experimental_attachments' in message)
  ) {
    return 'has-ui-specific-parts';
  } else if (
    typeof message === 'object' &&
    message !== null &&
    'content' in message &&
    (Array.isArray(message.content) || // Core messages can have array content
      'experimental_providerMetadata' in message ||
      'providerOptions' in message)
  ) {
    return 'has-core-specific-parts';
  } else if (
    typeof message === 'object' &&
    message !== null &&
    'role' in message &&
    'content' in message &&
    typeof message.content === 'string' &&
    ['system', 'user', 'assistant', 'tool'].includes(message.role)
  ) {
    return 'message';
  } else {
    return 'other';
  }
}
