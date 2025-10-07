'use client';

import { SourceExecutionFileUIPart } from 'ai';
import { codeInterpreterSourceExecutionFileSchema as openaiExecuteFileSchema } from '@ai-sdk/openai/internal';
import { z } from 'zod/v4';

const executeFileSchema = z.object({
  openai:openaiExecuteFileSchema,
});

export function ContainerFileCitationDownloadButton({
  part,
}: {
  part: SourceExecutionFileUIPart;
}) {

  const executeFileParse = executeFileSchema.safeParse(part.providerMetadata);
  if(!executeFileParse.success)return null;

  const {
    data:{
      openai:{
        containerId,
        fileId,
        filename,
      }
    }
  } = executeFileParse;
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
