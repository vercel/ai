import type {
  LanguageModelV4Citation,
  LanguageModelV4Source,
} from '@ai-sdk/provider';
import type { ResponsesTextProviderMetadata } from './openai-responses-provider-metadata';

type Annotation = NonNullable<
  ResponsesTextProviderMetadata['annotations']
>[number];

export function mapOpenAIResponsesAnnotationSource(
  annotation: Annotation,
  providerOptionsName: string,
  id: string,
): LanguageModelV4Source {
  if (annotation.type === 'url_citation') {
    return {
      type: 'source',
      sourceType: 'url',
      id,
      url: annotation.url,
      title: annotation.title,
    };
  }

  const filename =
    annotation.type === 'file_path' ? annotation.file_id : annotation.filename;
  return {
    type: 'source',
    sourceType: 'document',
    id,
    mediaType:
      annotation.type === 'file_path'
        ? 'application/octet-stream'
        : 'text/plain',
    title: filename,
    filename,
    providerMetadata: {
      [providerOptionsName]: {
        type: annotation.type,
        fileId: annotation.file_id,
        ...(annotation.type === 'container_file_citation'
          ? { containerId: annotation.container_id }
          : { index: annotation.index }),
      },
    },
  };
}

export function mapOpenAIResponsesCitations(
  annotations: Array<Annotation>,
  providerOptionsName: string,
): Array<LanguageModelV4Citation> {
  return annotations.flatMap(annotation =>
    annotation.type === 'file_path'
      ? []
      : [
          {
            source: mapOpenAIResponsesAnnotationSource(
              annotation,
              providerOptionsName,
              annotation.type === 'url_citation'
                ? annotation.url
                : annotation.file_id,
            ),
            ...('start_index' in annotation
              ? {
                  startIndex: annotation.start_index,
                  endIndex: annotation.end_index,
                }
              : {}),
          },
        ],
  );
}
