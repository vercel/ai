export function detectPromptType(
  prompt: Array<any>,
): 'ui-messages' | 'model-messages' | 'other' {
  if (!Array.isArray(prompt)) {
    return 'other';
  }

  if (prompt.length === 0) {
    return 'model-messages';
  }

  const characteristics = prompt.map(detectSingleMessageCharacteristics);

  if (characteristics.some(c => c === 'has-ui-specific-parts')) {
    return 'ui-messages';
  } else if (
    characteristics.every(
      c => c === 'has-core-specific-parts' || c === 'message',
    )
  ) {
    return 'model-messages';
  } else {
    return 'other';
  }
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
