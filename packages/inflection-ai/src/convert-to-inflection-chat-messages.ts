import {
  LanguageModelV1Prompt,
  LanguageModelV1TextPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

/**
 * Represents a message in the Inflection AI format
 */
export interface InflectionMessage {
  /** The type of the message sender */
  type: 'Human' | 'AI' | 'Instruction';
  /** The text content of the message */
  text: string;
  /** Optional timestamp in seconds since epoch */
  ts?: number;
}

export type InflectionContext = InflectionMessage[];

/**
 * Converts a Language Model prompt to Inflection AI's context format
 * @param prompt The input prompt in the Language Model format
 * @returns An array of messages in Inflection AI's format
 * @throws {UnsupportedFunctionalityError} If the prompt contains unsupported content types
 */
export function convertToInflectionChatMessages(
  prompt: LanguageModelV1Prompt,
): InflectionContext {
  const context: InflectionContext = [];

  for (const { role, content } of prompt) {
    let text = '';

    if (typeof content === 'string') {
      text = content;
    } else {
      // Combine all text parts into a single string
      for (const part of content) {
        switch (part.type) {
          case 'text': {
            text += part.text;
            break;
          }
          case 'image': {
            throw new UnsupportedFunctionalityError({
              functionality:
                'Image content parts are not supported by Inflection AI at this time',
            });
          }
          case 'file': {
            throw new UnsupportedFunctionalityError({
              functionality:
                'File content parts are not supported by Inflection AI at this time',
            });
          }
          case 'tool-call': {
            throw new UnsupportedFunctionalityError({
              functionality:
                'Tool calls are not supported by Inflection AI at this time',
            });
          }
          case 'tool-result': {
            throw new UnsupportedFunctionalityError({
              functionality:
                'Tool results are not supported by Inflection AI at this time',
            });
          }
          default: {
            const _exhaustiveCheck: never = part;
            throw new Error(
              `Unsupported content part type: ${_exhaustiveCheck}`,
            );
          }
        }
      }
    }

    if (!text) {
      continue; // Skip empty messages
    }

    // Map the role to Inflection's expected type
    switch (role) {
      case 'user': {
        context.push({ type: 'Human', text });
        break;
      }
      case 'assistant': {
        context.push({ type: 'AI', text });
        break;
      }
      case 'system': {
        context.push({ type: 'Instruction', text });
        break;
      }
      case 'tool': {
        // Tool responses are handled as part of the content processing above
        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return context;
}
