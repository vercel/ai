import {
  type LanguageModelV2,
  type LanguageModelV3,
  type LanguageModelV3Content,
  type LanguageModelV3DataContent,
  type LanguageModelV3Prompt,
  type LanguageModelV3StreamPart,
  type LanguageModelV3ToolResultOutput,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4Content,
  type LanguageModelV4Prompt,
  type LanguageModelV4StreamPart,
  type LanguageModelV4ToolResultOutput,
  type SharedV4FileData,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { asLanguageModelV3 } from './as-language-model-v3';

export function asLanguageModelV4(
  model: LanguageModelV2 | LanguageModelV3 | LanguageModelV4,
): LanguageModelV4 {
  if (model.specificationVersion === 'v4') {
    return model;
  }

  // first convert v2 to v3, then proxy v3 as v4:
  const v3Model =
    model.specificationVersion === 'v2' ? asLanguageModelV3(model) : model;

  return new Proxy(v3Model, {
    get(target, prop: keyof LanguageModelV3) {
      switch (prop) {
        case 'specificationVersion':
          return 'v4';
        case 'doGenerate':
          return async (options: LanguageModelV4CallOptions) => {
            const result = await target.doGenerate({
              ...options,
              prompt: convertV4PromptToV3(options.prompt),
            });

            return {
              ...result,
              content: result.content.map(convertV3ContentToV4),
            };
          };
        case 'doStream':
          return async (options: LanguageModelV4CallOptions) => {
            const result = await target.doStream({
              ...options,
              prompt: convertV4PromptToV3(options.prompt),
            });

            return {
              ...result,
              stream: convertV3StreamToV4(result.stream),
            };
          };
        default:
          return target[prop];
      }
    },
  }) as unknown as LanguageModelV4;
}

function convertV4PromptToV3(
  prompt: LanguageModelV4Prompt,
): LanguageModelV3Prompt {
  return prompt.map(message => {
    if (message.role === 'system') {
      return message;
    }

    return {
      ...message,
      content: message.content.map(part => {
        switch (part.type) {
          case 'file':
            return {
              ...part,
              data: convertV4FileDataToV3(part.data),
            };
          case 'tool-result':
            return {
              ...part,
              output: convertV4ToolResultOutputToV3(part.output),
            };
          default:
            return part;
        }
      }),
    };
  }) as LanguageModelV3Prompt;
}

function convertV4FileDataToV3(
  data: SharedV4FileData,
): LanguageModelV3DataContent {
  switch (data.type) {
    case 'data':
      return data.data;
    case 'url':
      return data.url;
    case 'reference':
    case 'text':
      // pass through unsupported types as is
      return data as unknown as LanguageModelV3DataContent;
  }
}

function convertV4ToolResultOutputToV3(
  output: LanguageModelV4ToolResultOutput,
): LanguageModelV3ToolResultOutput {
  if (output.type !== 'content') {
    return output;
  }

  return {
    ...output,
    value: output.value.map(part => {
      if (part.type !== 'file') {
        return part;
      }

      switch (part.data.type) {
        case 'data':
          return {
            type: 'file-data' as const,
            data:
              typeof part.data.data === 'string'
                ? part.data.data
                : convertUint8ArrayToBase64(part.data.data),
            mediaType: part.mediaType,
            filename: part.filename,
            providerOptions: part.providerOptions,
          };
        case 'url':
          return {
            type: 'file-url' as const,
            url: part.data.url.toString(),
            providerOptions: part.providerOptions,
          };
        case 'reference':
          return {
            type: 'file-id' as const,
            fileId: part.data.reference,
            providerOptions: part.providerOptions,
          };
        case 'text':
          return part;
      }
    }),
  } as LanguageModelV3ToolResultOutput;
}

function convertV3ContentToV4(
  content: LanguageModelV3Content,
): LanguageModelV4Content {
  return content.type === 'file'
    ? {
        ...content,
        data: { type: 'data', data: content.data },
      }
    : content;
}

function convertV3StreamToV4(
  stream: ReadableStream<LanguageModelV3StreamPart>,
): ReadableStream<LanguageModelV4StreamPart> {
  return stream.pipeThrough(
    new TransformStream<LanguageModelV3StreamPart, LanguageModelV4StreamPart>({
      transform(chunk, controller) {
        controller.enqueue(
          chunk.type === 'file'
            ? {
                ...chunk,
                data: { type: 'data', data: chunk.data },
              }
            : chunk,
        );
      },
    }),
  );
}
