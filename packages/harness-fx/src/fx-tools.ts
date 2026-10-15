import type {
  HarnessV1PermissionMode,
  HarnessV1PromptControl,
} from '@ai-sdk/harness';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import type { JSONValue } from '@ai-sdk/provider';
import type { FxToolResult } from './fx-runtime';

export type FxToolSubmission = Parameters<
  HarnessV1PromptControl['submitToolResult']
>[0];

export function fxToolRequiresApproval(options: {
  permissionMode: HarnessV1PermissionMode;
  kind: 'readonly' | 'edit' | 'bash';
}): boolean {
  return (
    options.permissionMode !== 'allow-all' &&
    (options.kind === 'bash' ||
      (options.kind === 'edit' && options.permissionMode === 'allow-reads'))
  );
}

export function fxJsonValue(value: unknown): JSONValue {
  if (value == null) return null;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? String(value)
      : (secureJsonParse(serialized) as JSONValue);
  } catch {
    return String(value);
  }
}

export function toFxToolResult(submission: FxToolSubmission): FxToolResult {
  const output = submission.toolResult?.output;
  const result: FxToolResult = {
    type: 'libfx.tool-result',
    text: '',
    images: [],
    isError: submission.isError,
  };
  if (output == null) {
    result.text =
      typeof submission.output === 'string'
        ? submission.output
        : JSON.stringify(fxJsonValue(submission.output));
    return result;
  }
  switch (output.type) {
    case 'text':
    case 'error-text':
      result.text = output.value;
      result.isError ||= output.type === 'error-text';
      break;
    case 'json':
    case 'error-json':
      result.text = JSON.stringify(output.value);
      result.isError ||= output.type === 'error-json';
      break;
    case 'execution-denied':
      result.text = output.reason ?? 'Tool execution was denied.';
      result.isError = true;
      break;
    case 'content':
      result.text = output.value
        .map(part => {
          if (part.type === 'text') return part.text;
          if (
            part.type === 'file' &&
            part.mediaType.startsWith('image/') &&
            part.data.type === 'data'
          ) {
            result.images.push({
              type: 'image',
              mimeType: part.mediaType,
              data:
                typeof part.data.data === 'string'
                  ? part.data.data
                  : Buffer.from(
                      part.data.data instanceof ArrayBuffer
                        ? new Uint8Array(part.data.data)
                        : part.data.data,
                    ).toString('base64'),
            });
            return '';
          }
          return JSON.stringify(part);
        })
        .filter(Boolean)
        .join('\n');
      break;
  }
  return result;
}
