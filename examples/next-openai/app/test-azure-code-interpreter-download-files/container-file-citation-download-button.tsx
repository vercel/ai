'use client';

import { SourceExecutionFileUIPart } from 'ai';
import { openaiSourceExecutionFileProviderMetadataSchema } from '@ai-sdk/openai';
import { azureSourceExecutionFileProviderMetadataSchema } from '@ai-sdk/azure';
import { z } from 'zod/v4';

// union of each providers
const sourceExecutionFileProviderMetadataSchema = z.union([
  openaiSourceExecutionFileProviderMetadataSchema,
  azureSourceExecutionFileProviderMetadataSchema,
]);

export function ContainerFileCitationDownloadButton({
  part,
}: {
  part: SourceExecutionFileUIPart;
}) {
  if (!part.providerMetadata) return null;

  const providerMetadataParsed =
    sourceExecutionFileProviderMetadataSchema.safeParse(part.providerMetadata);
  if (!providerMetadataParsed.success) return null;

  const [provider, { containerId, fileId, filename }] =
    'openai' in providerMetadataParsed.data
      ? ['openai' as const, providerMetadataParsed.data.openai]
      : ['azure' as const, providerMetadataParsed.data.azure];

  const onClick = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    window.open(
      `${baseUrl}/api/chat-${provider}-code-interpreter-download-files/${containerId}/${fileId}`,
      '_blank',
    );
  };

  return (
    <>
      <button
        className="bg-blue-500 text-white border rounded py-1 px-2"
        onClick={() => onClick()}
      >
        download <span className="font-bold">{filename}</span>
      </button>
    </>
  );
}
