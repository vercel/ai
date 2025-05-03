import { InvalidPromptError } from '@ai-sdk/provider';

export function detectPromptType(
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
