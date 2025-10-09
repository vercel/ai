'use client';

import { SourceExecutionFileUIPart } from 'ai';
import { azureSourceExecutionFileProviderMetadataSchema } from '@ai-sdk/azure';

export function ContainerFileCitationDownloadButton({
  part,
}: {
  part: SourceExecutionFileUIPart;
}) {
  const executeFileParsed =
    azureSourceExecutionFileProviderMetadataSchema.safeParse(
      part.providerMetadata,
    );
  if (!executeFileParsed.success) return null;

  const {
    azure: { containerId, fileId, filename },
  } = executeFileParsed.data;
  const onClick = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    window.open(
      `${baseUrl}/api/chat-azure-code-interpreter-download-files/${containerId}/${fileId}`,
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
