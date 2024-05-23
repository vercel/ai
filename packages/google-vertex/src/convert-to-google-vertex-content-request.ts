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
          // TODO supported
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

              default: {
                const _exhaustiveCheck = part;
                throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
              }

              // case 'image': {
              //   if (part.image instanceof URL) {
              //     throw new UnsupportedFunctionalityError({
              //       functionality: 'URL image parts',
              //     });
              //   } else {
              //     return {
              //       type: 'image',
              //       source: {
              //         type: 'base64',
              //         media_type: part.mimeType ?? 'image/jpeg',
              //         data: convertUint8ArrayToBase64(part.image),
              //       },
              //     };
              //   }
              // }
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

              default: {
                const _exhaustiveCheck = part;
                throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
              }

              // case 'tool-call': {
              //   return {
              //     type: 'tool_use',
              //     id: part.toolCallId,
              //     name: part.toolName,
              //     input: part.args,
              //   };
              // }
            }
          }),
        });

        break;
      }
      // case 'tool': {
      //   contents.push({
      //     role: 'user',
      //     content: content.map(part => ({
      //       type: 'tool_result',
      //       tool_use_id: part.toolCallId,
      //       content: JSON.stringify(part.result),
      //       is_error: part.isError,
      //     })),
      //   });

      //   break;
      // }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return {
    systemInstruction,
    contents,
  };
}
