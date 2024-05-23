import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { Content, GenerateContentRequest } from '@google-cloud/vertexai';

export function convertToGoogleVertexContentRequest(
  prompt: LanguageModelV1Prompt,
): GenerateContentRequest {
  let systemInstruction: string | undefined = undefined;
  const contents: Content[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        if (systemInstruction != null) {
          throw new UnsupportedFunctionalityError({
            functionality: 'Multiple system messages',
          });
        }

        systemInstruction = content;
        break;
      }

      case 'user': {
        contents.push({
          role: 'user',
          parts: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { text: part.text };
              }

              case 'image': {
                if (part.image instanceof URL) {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'URL image parts',
                  });
                } else {
                  return {
                    inlineData: {
                      data: convertUint8ArrayToBase64(part.image),
                      mimeType: part.mimeType ?? 'image/jpeg',
                    },
                  };
                }
              }

              default: {
                const _exhaustiveCheck: never = part;
                throw new UnsupportedFunctionalityError({
                  functionality: `prompt part: ${_exhaustiveCheck}`,
                });
              }
            }
          }),
        });
        break;
      }

      case 'assistant': {
        contents.push({
          role: 'assistant',
          parts: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text };
              }

              case 'tool-call': {
                throw new UnsupportedFunctionalityError({
                  functionality: 'tool-call',
                });
              }

              default: {
                const _exhaustiveCheck: never = part;
                throw new UnsupportedFunctionalityError({
                  functionality: `prompt part: ${_exhaustiveCheck}`,
                });
              }
            }
          }),
        });

        break;
      }

      case 'tool': {
        throw new UnsupportedFunctionalityError({
          functionality: `role: tool`,
        });
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new UnsupportedFunctionalityError({
          functionality: `role: ${_exhaustiveCheck}`,
        });
      }
    }
  }

  return {
    systemInstruction,
    contents,
  };
}
