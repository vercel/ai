import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import { HarnessBridgeCapabilityUnsupportedError } from '../bridge/harness-bridge-capability-unsupported-error';

export type HarnessToolModelOutputContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mediaType: string };

type ToolModelOutputContentPart = Extract<
  ToolResultOutput,
  { type: 'content' }
>['value'][number];

function getNormalizedInlineImage(
  part: ToolModelOutputContentPart,
): { data: string; mediaType: string } | undefined {
  if (
    part.type === 'file' &&
    part.mediaType.startsWith('image/') &&
    part.mediaType !== 'image/*' &&
    part.data.type === 'data' &&
    typeof part.data.data === 'string'
  ) {
    return { data: part.data.data, mediaType: part.mediaType };
  }
  return undefined;
}

export function convertHarnessToolModelOutput({
  output,
}: {
  output: ToolResultOutput;
}): { content: HarnessToolModelOutputContent[]; isError: boolean } {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return {
        content: [{ type: 'text', text: output.value }],
        isError: output.type === 'error-text',
      };
    case 'json':
    case 'error-json':
      return {
        content: [{ type: 'text', text: JSON.stringify(output.value) }],
        isError: output.type === 'error-json',
      };
    case 'execution-denied':
      return {
        content: [
          { type: 'text', text: output.reason ?? 'Tool execution denied.' },
        ],
        isError: true,
      };
    case 'content':
      return {
        content: output.value.map(part => {
          if (part.type === 'text') return { type: 'text', text: part.text };
          const image = getNormalizedInlineImage(part);
          if (image != null) return { type: 'image', ...image };
          throw new HarnessBridgeCapabilityUnsupportedError({
            message: `Harnesses support only text and inline images in tool model output; unsupported content '${part.type}'.`,
          });
        }),
        isError: false,
      };
  }
}
