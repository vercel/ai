import { openaiReseponseAnnotationSchema } from '@ai-sdk/openai';
import { OpenAICodeInterpreterMessage } from '../api/chat-openai-code-interpreter-download-files/route';
import z from 'zod/v4';
import { Response } from './additional-dependencies';

type UIMessageTextPart = Extract<
  OpenAICodeInterpreterMessage['parts'][number],
  { type: 'text' }
>;

export function MessageTextWithDownloadLink({
  part,
}: {
  part: UIMessageTextPart;
}) {
  const annotationsAny = part.providerMetadata?.openai.annotations;
  const annotationsParse = z
    .array(openaiReseponseAnnotationSchema)
    .safeParse(annotationsAny);
  const annotations = annotationsParse.success ? annotationsParse.data : [];

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const text = annotations.reduce<string>((acc, cur) => {
    const text = (() => {
      switch (cur.type) {
        case 'container_file_citation':
          return (
            acc.slice(0, cur.start_index) +
            `${baseUrl}/api/chat-openai-code-interpreter-download-files/${cur.container_id}/${cur.file_id}` +
            acc.slice(cur.end_index)
          );
        default:
          return acc;
      }
    })();
    return text;
  }, part.text);

  return <Response>{text}</Response>;
}
