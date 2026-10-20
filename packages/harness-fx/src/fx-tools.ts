import type {
  HarnessV1PermissionMode,
  HarnessV1PromptControl,
} from '@ai-sdk/harness';
import {
  convertHarnessToolModelOutput,
  normalizeHarnessToolModelOutput,
} from '@ai-sdk/harness/utils';
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
  const converted = convertHarnessToolModelOutput({
    output: normalizeHarnessToolModelOutput({
      output:
        output.type === 'execution-denied'
          ? { ...output, reason: output.reason ?? 'Tool execution was denied.' }
          : output,
    }),
  });
  const text: string[] = [];
  for (const part of converted.content) {
    if (part.type === 'text') {
      if (part.text) text.push(part.text);
    } else {
      result.images.push({
        type: 'image',
        data: part.data,
        mimeType: part.mediaType,
      });
    }
  }
  result.text = text.join('\n');
  result.isError = converted.isError
    ? true
    : output.type === 'content'
      ? submission.isError
      : Boolean(submission.isError);
  return result;
}
