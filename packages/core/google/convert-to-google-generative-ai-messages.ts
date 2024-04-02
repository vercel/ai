import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
  convertUint8ArrayToBase64,
} from '../spec';
import { GoogleGenerativeAIPrompt } from './google-generative-ai-prompt';

export function convertToGoogleGenerativeAIMessages({
  prompt,
  provider,
}: {
  prompt: LanguageModelV1Prompt;
  provider: string;
}): GoogleGenerativeAIPrompt {
  const messages: GoogleGenerativeAIPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        throw new UnsupportedFunctionalityError({
          provider,
          functionality: 'system-message',
        });
        break;
      }

      case 'user': {
        messages.push({
          role: 'user',
          parts: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { text: part.text };
              }
              case 'image': {
                if (part.image instanceof URL) {
                  throw new UnsupportedFunctionalityError({
                    provider,
                    functionality: 'URL image parts',
                  });
                } else {
                  return {
                    inlineData: {
                      mimeType: part.mimeType ?? 'image/jpeg',
                      data: convertUint8ArrayToBase64(part.image),
                    },
                  };
                }
              }
            }
          }),
        });
        break;
      }

      case 'assistant': {
        messages.push({
          role: 'model',
          parts: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { text: part.text };
              }
              case 'tool-call': {
                throw new UnsupportedFunctionalityError({
                  provider,
                  functionality: 'tool-call',
                });
              }
            }
          }),
        });
        break;
      }

      case 'tool': {
        throw new UnsupportedFunctionalityError({
          provider,
          functionality: 'tool-message',
        });
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
