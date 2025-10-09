import { azureResponsesTextUIPartProviderMetadataSchema } from '@ai-sdk/azure';
import { Response } from './additional-dependencies';
import { TextUIPart } from 'ai';

export function MessageTextWithDownloadLink({ part }: { part: TextUIPart }) {
  const providerMetadataParsed =
    azureResponsesTextUIPartProviderMetadataSchema.safeParse(
      part.providerMetadata,
    );
  const annotations = providerMetadataParsed.success
    ? providerMetadataParsed.data.azure.annotations
    : [];

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const text = annotations.reduce<string>((acc, cur) => {
    const text = (() => {
      switch (cur.type) {
        case 'container_file_citation':
          if (cur.start_index === 0 && cur.end_index === 0) return acc;
          return (
            acc.slice(0, cur.start_index) +
            `${baseUrl}/api/chat-azure-code-interpreter-download-files/${cur.container_id}/${cur.file_id}` +
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
