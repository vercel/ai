'use client';

import { SourceExecutionFileUIPart } from 'ai';
import { openaiSourceExecutionFileProviderMetadataSchema } from '@ai-sdk/openai';
import { azureSourceExecutionFileProviderMetadataSchema } from '@ai-sdk/azure';
import { anthropicSourceExecutionFileProviderMetadataSchema } from '@ai-sdk/anthropic';
import { z } from 'zod/v4';

// union of each providers
const sourceExecutionFileProviderMetadataSchema = z.union([
  openaiSourceExecutionFileProviderMetadataSchema,
  azureSourceExecutionFileProviderMetadataSchema,
  anthropicSourceExecutionFileProviderMetadataSchema,
]);

export function SourceExecutionFileDownload({
  part,
}: {
  part: SourceExecutionFileUIPart;
}) {
  if (!part.providerMetadata) return null;

  const providerMetadataParsed =
    sourceExecutionFileProviderMetadataSchema.safeParse(part.providerMetadata);
  if (!providerMetadataParsed.success) return null;

  if ('openai' in providerMetadataParsed.data) {
    return (
      <OpenaiLikeSourceExecutionFile
        provider="openai"
        metadata={providerMetadataParsed.data.openai}
      />
    );
  } else if ('azure' in providerMetadataParsed.data) {
    return (
      <OpenaiLikeSourceExecutionFile
        provider="azure"
        metadata={providerMetadataParsed.data.azure}
      />
    );
  } else if ('anthropic' in providerMetadataParsed.data) {
    if (providerMetadataParsed.data.anthropic.content.type)
      return (
        <AnthropicLikeSourceExecutionFile
          provider="anthropic"
          metadata={providerMetadataParsed.data.anthropic}
        />
      );
  }
  return null;
}

function OpenaiLikeSourceExecutionFile({
  provider,
  metadata: { containerId, fileId, filename },
}: {
  provider: 'openai' | 'azure';
  metadata: z.infer<
    typeof openaiSourceExecutionFileProviderMetadataSchema
  >['openai'];
}) {
  const onClick = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    window.open(
      `${baseUrl}/api/code-execution-files/${provider}/${containerId}/${fileId}`,
      '_blank',
    );
  };

  return (
    <button
      className="bg-blue-500 text-white border rounded py-1 px-2"
      onClick={() => onClick()}
    >
      download <span className="font-bold">{filename}</span>
    </button>
  );
}

function AnthropicLikeSourceExecutionFile({
  provider,
  metadata: { content, tool_use_id },
}: {
  provider: 'anthropic';
  metadata: z.infer<
    typeof anthropicSourceExecutionFileProviderMetadataSchema
  >['anthropic'];
}) {
  switch (content.type) {
    case 'bash_code_execution_result': {
      const { content: fileList, stdout, stderr, return_code } = content;
      const baseUrl =
        typeof window !== 'undefined' ? window.location.origin : '';

      return (
        <div>
          <div className="py-1 flex flex-col gap-1">
            {fileList.map(file => {
              const fileId = file.file_id;
              return (
                <button
                  key={fileId}
                  className="bg-blue-500 text-white border rounded py-1 px-2"
                  onClick={() =>
                    window.open(
                      `${baseUrl}/api/code-execution-files/${provider}/${fileId}`,
                      '_blank',
                    )
                  }
                >
                  <span className="font-bold">download file - ${fileId}</span>
                </button>
              );
            })}
            <p className="bg-cyan-200 text-cyan-600 text-xs rounded">
              tool_use_id: {tool_use_id}
            </p>
            {stdout.length > 0 && (
              <p className="bg-gray-200 text-gray-600 text-xs rounded">
                {stdout}
              </p>
            )}
            {stderr.length > 0 && (
              <p className="bg-red-200 text-red-600 text-xs rounded">
                stderr: {stderr}
              </p>
            )}
            <p className="bg-gray-200 text-gray-600 text-xs rounded">
              return_code: {return_code}
            </p>
          </div>
        </div>
      );
    }
    case 'bash_code_execution_tool_result_error': {
      return (
        <div className="border bg-red-100">
          error_code:${content.error_code}
        </div>
      );
    }
  }
}
