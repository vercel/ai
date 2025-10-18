'use client';

import { SourceExecutionFileUIPart } from 'ai';
import { openaiSourceExecutionFileProviderMetadataSchema } from '@ai-sdk/openai';

export function ContainerFileCitationDownloadButton({
  part,
}: {
  part: SourceExecutionFileUIPart;
}) {
  const executeFileParsed =
    openaiSourceExecutionFileProviderMetadataSchema.safeParse(
      part.providerMetadata,
    );
  if (!executeFileParsed.success) return null;

  const {
    openai: { containerId, fileId, filename },
  } = executeFileParsed.data;
  const onClick = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    window.open(
      `${baseUrl}/api/chat-openai-code-interpreter-download-files/${containerId}/${fileId}`,
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
