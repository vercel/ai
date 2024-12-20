import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import {
  OpenAICompatibleAssistantMessage,
  OpenAICompatibleChatPrompt,
  OpenAICompatibleUserMessage,
} from './openai-compatible-api-types';

/**
 * Recursively merges providerMetadata.openaiCompatible into the current object
 * and also preserves any non-openaiCompatible metadata:
 *
 * 1) If a message has exactly one "text" content part, we flatten it to a string,
 *    and hoist that part’s metadata onto the message object itself.
 * 2) If a message has multiple parts, or if the single part isn’t "text", we keep
 *    them as an array of parts and hoist each part’s metadata onto that part.
 * 3) For tool calls, we gather them into a "tool_calls" array on the message, and
 *    transform "type: 'tool-call'" into "type: 'function'".
 * 4) For images, if "image" is a URL instance, we keep it as a plain URL string;
 *    otherwise, we convert the bytes to a data URL.
 */
export function convertToOpenAICompatibleChatMessages(
  prompt: LanguageModelV1Prompt,
): OpenAICompatibleChatPrompt {
  const messages: OpenAICompatibleChatPrompt = [];

  for (const originalMessage of prompt) {
    const { role } = originalMessage;

    switch (role) {
      case 'system': {
        // 1) Hoist system message–level metadata
        const { openAIMetadata, preservedMessage } =
          hoistOpenAIFields(originalMessage);

        // Keep content as a simple string if it’s a string, else empty
        const content =
          typeof preservedMessage.content === 'string'
            ? preservedMessage.content
            : '';

        messages.push({
          role: 'system',
          content,
          ...openAIMetadata, // system-level openaiCompatible metadata, if any
          // Keep other non-openaiCompatible providerMetadata if present
          ...(preservedMessage.providerMetadata
            ? { providerMetadata: preservedMessage.providerMetadata }
            : {}),
        });
        break;
      }

      case 'user': {
        const { openAIMetadata, preservedMessage } =
          hoistOpenAIFields(originalMessage);

        const finalUserMessage: Record<string, any> = {
          role: 'user',
          // Merged message-level metadata
          ...openAIMetadata,
        };

        // If content is array, see if it's exactly one text part
        if (Array.isArray(preservedMessage.content)) {
          const parts = preservedMessage.content;

          if (parts.length === 1 && parts[0].type === 'text') {
            // Flatten single text part to a string
            const singlePart = parts[0];
            // Hoist the part’s openaiCompatible fields to the message
            const {
              openAIMetadata: partMetadata,
              preservedMessage: preservedPart,
            } = hoistOpenAIFields(singlePart);

            finalUserMessage.content = preservedPart.text ?? '';
            // Merge part-level metadata onto the message
            Object.assign(finalUserMessage, partMetadata);

            // If there was leftover providerMetadata on the part, preserve it
            if (preservedPart.providerMetadata) {
              finalUserMessage.providerMetadata = {
                ...finalUserMessage.providerMetadata,
                ...{ providerMetadata: preservedPart.providerMetadata },
              };
            }
          } else {
            // Multiple parts or single non-text part => transform each part
            finalUserMessage.content = parts.map(transformUserContentPart);
          }
        } else {
          // If there’s no array content or it’s already a string
          finalUserMessage.content =
            typeof preservedMessage.content === 'string'
              ? preservedMessage.content
              : preservedMessage.content ?? '';
        }

        // Preserve leftover providerMetadata if any
        if (preservedMessage.providerMetadata) {
          finalUserMessage.providerMetadata = preservedMessage.providerMetadata;
        }

        messages.push(finalUserMessage as OpenAICompatibleUserMessage);
        break;
      }

      case 'assistant': {
        // For assistant messages, we might have text parts + tool calls
        const { openAIMetadata, preservedMessage } =
          hoistOpenAIFields(originalMessage);
        const finalAssistantMessage: Record<string, any> = {
          role: 'assistant',
          ...openAIMetadata,
        };

        if (Array.isArray(preservedMessage.content)) {
          let text = '';
          const toolCalls: Array<any> = [];

          for (const part of preservedMessage.content) {
            const { openAIMetadata: partMetadata, preservedMessage: pm } =
              hoistOpenAIFields(part);

            if (pm.type === 'text') {
              text += pm.text ?? '';
              // You could optionally merge part-level metadata somewhere, but
              // it's not clear we require it for simple assistant text
            } else if (pm.type === 'tool-call') {
              // Convert tool-call => type: 'function'
              toolCalls.push({
                id: pm.toolCallId,
                type: 'function',
                function: {
                  name: pm.toolName,
                  arguments: JSON.stringify(pm.args ?? {}),
                },
                // Merge whatever openAI fields were on the part:
                ...partMetadata,
              });
            }
          }

          finalAssistantMessage.content = text;
          if (toolCalls.length > 0) {
            finalAssistantMessage.tool_calls = toolCalls;
          }
        } else {
          // If not an array, just treat as text
          finalAssistantMessage.content =
            typeof preservedMessage.content === 'string'
              ? preservedMessage.content
              : '';
        }

        // Keep leftover providerMetadata
        if (preservedMessage.providerMetadata) {
          finalAssistantMessage.providerMetadata =
            preservedMessage.providerMetadata;
        }

        messages.push(
          finalAssistantMessage as OpenAICompatibleAssistantMessage,
        );
        break;
      }

      case 'tool': {
        // Tools typically respond with content: [{ type:'tool-result', ... }]
        // Each result chunk becomes a separate message in some flows,
        // but here we’re folding them into a single role: 'tool'
        const { openAIMetadata, preservedMessage } =
          hoistOpenAIFields(originalMessage);

        if (Array.isArray(preservedMessage.content)) {
          for (const toolResponse of preservedMessage.content) {
            // Hoist part-level openAIMetadata as well
            const { openAIMetadata: partMetadata, preservedMessage: pm } =
              hoistOpenAIFields(toolResponse);

            messages.push({
              role: 'tool',
              tool_call_id: pm.toolCallId,
              content: JSON.stringify(pm.result ?? {}),
              // Merge any openAIMetadata from the part
              ...partMetadata,
              // Merge any openAIMetadata from the top-level 'tool' message
              ...openAIMetadata,
              // If leftover providerMetadata is needed, attach it
              ...(pm.providerMetadata
                ? { providerMetadata: pm.providerMetadata }
                : {}),
              ...(preservedMessage.providerMetadata
                ? { providerMetadata: preservedMessage.providerMetadata }
                : {}),
            });
          }
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}

/**
 * Transforms a single user content part (e.g. text/image) into the final shape
 * required, preserving or hoisting openaiCompatible fields onto the part object
 * (not the entire message).
 *
 * This is only used in the array-of-parts case for user messages.
 */
function transformUserContentPart(part: any): any {
  // First, hoist the part’s openAI fields
  const { openAIMetadata, preservedMessage: pm } = hoistOpenAIFields(part);

  if (pm.type === 'text') {
    // Keep it as { type: 'text', text: pm.text }
    return {
      type: 'text',
      text: pm.text ?? '',
      ...openAIMetadata,
      ...(pm.providerMetadata ? { providerMetadata: pm.providerMetadata } : {}),
    };
  }

  if (pm.type === 'image') {
    // Convert to type: 'image_url'
    const url =
      pm.image instanceof URL
        ? pm.image.toString()
        : `data:${
            pm.mimeType ?? 'image/jpeg'
          };base64,${convertUint8ArrayToBase64(pm.image)}`;
    return {
      type: 'image_url',
      image_url: { url },
      ...openAIMetadata,
      ...(pm.providerMetadata ? { providerMetadata: pm.providerMetadata } : {}),
    };
  }

  if (pm.type === 'file') {
    throw new UnsupportedFunctionalityError({
      functionality: 'File content parts in user messages',
    });
  }

  // If the part isn’t recognized, pass it through unchanged,
  // but still attach openAIMetadata.
  return { ...pm, ...openAIMetadata };
}

/**
 * Hoists all fields from providerMetadata.openaiCompatible (if any) onto the
 * same object. Returns { openAIMetadata, preservedMessage } such that
 * openAIMetadata can be merged as needed. Also leaves any non-openaiCompatible
 * fields in providerMetadata intact.
 */
function hoistOpenAIFields(obj: any): {
  openAIMetadata: Record<string, any>;
  preservedMessage: any;
} {
  if (!obj || typeof obj !== 'object') {
    return { openAIMetadata: {}, preservedMessage: obj };
  }

  // Shallow clone
  const newObj = { ...obj };
  const { providerMetadata } = newObj;
  let openAIMetadata: Record<string, any> = {};

  if (providerMetadata?.openaiCompatible) {
    // Spread openaiCompatible fields
    openAIMetadata = { ...providerMetadata.openaiCompatible };
    // Remove just openaiCompatible from providerMetadata
    const { openaiCompatible, ...rest } = providerMetadata;
    // If no keys remain, remove providerMetadata entirely
    newObj.providerMetadata = Object.keys(rest).length > 0 ? rest : undefined;
  }

  return {
    openAIMetadata,
    preservedMessage: newObj,
  };
}
