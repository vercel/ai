import type { LanguageModelV4ToolResultOutput } from '@ai-sdk/provider';
import type { Tool, ToolResultOutput } from '@ai-sdk/provider-utils';
import type { ModelMessage } from 'ai';
import {
  createDefaultDownloadFunction,
  createToolModelOutput,
  downloadAssets,
  mapToolResultOutput,
  type DownloadFunction,
} from 'ai/internal';

/**
 * Creates both the AI-level output used in response messages and the
 * provider-level output used for durable model continuation, honoring the
 * tool's optional `toModelOutput` hook.
 *
 * Keeping both values lets callers reuse the result of `tool.toModelOutput`
 * instead of invoking a user-defined transformation again when constructing
 * response messages.
 *
 * Unlike `generateText`/`streamText`, `WorkflowAgent` assembles the
 * `LanguageModelV4` prompt incrementally — appending one tool result at a time
 * — instead of building AI-level `ModelMessage`s and converting the whole
 * prompt once via `convertToLanguageModelPrompt`. This helper performs the
 * equivalent per-result conversion using the shared `ai/internal` primitives:
 *
 *   1. `createToolModelOutput` — applies `tool.toModelOutput` (or the
 *      text/json/error fallback).
 *   2. `downloadAssets` — for `content`-type outputs, downloads any file/image
 *      assets so URLs become bytes the provider can consume.
 *   3. `mapToolResultOutput` — maps the AI-level `ToolResultOutput` to the
 *      provider-level output and converts legacy file types.
 */
export async function createLanguageModelToolResultOutputs({
  toolCallId,
  toolName,
  input,
  output,
  tool,
  errorMode,
  supportedUrls,
  download = createDefaultDownloadFunction(),
  provider,
}: {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  tool: Tool | undefined;
  errorMode: 'none' | 'text' | 'json';
  supportedUrls: Record<string, RegExp[]>;
  download?: DownloadFunction;
  provider?: string;
}): Promise<{
  modelOutput: ToolResultOutput;
  languageModelOutput: LanguageModelV4ToolResultOutput;
}> {
  const modelOutput = await createToolModelOutput({
    toolCallId,
    input,
    output,
    tool,
    errorMode,
  });

  const downloadedAssets =
    modelOutput.type === 'content'
      ? await downloadAssets(
          [
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId,
                  toolName,
                  output: modelOutput,
                },
              ],
            } satisfies ModelMessage,
          ],
          download,
          supportedUrls,
        )
      : {};

  return {
    modelOutput,
    languageModelOutput: mapToolResultOutput({
      output: modelOutput,
      provider,
      downloadedAssets,
    }),
  };
}
