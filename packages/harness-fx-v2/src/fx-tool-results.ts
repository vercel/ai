import type {
  HarnessV2ToolExecutionOutput,
  HarnessV2ToolExecutionValue,
} from '@ai-sdk/harness';
import {
  convertHarnessToolModelOutput,
  normalizeHarnessToolModelOutput,
} from '@ai-sdk/harness/utils';
import type { FxToolResult } from 'libfx/node';
import type { FxBuiltinToolOutput } from './fx-builtin-tools';

/*
 * libfx accepts at most this many images in one tool result
 * (`FxToolResult['images']`).
 */
const MAX_RESULT_IMAGES = 8;

/**
 * Describes a tool call outcome other than a result, as the text of the
 * error result libfx gives the model.
 */
export function describeToolFailure(options: {
  /**
   * Outcome of the tool call.
   */
  output: Exclude<HarnessV2ToolExecutionOutput, { type: 'result' }>;

  /**
   * Name of the called tool.
   */
  toolName: string;
}): string {
  const { output, toolName } = options;
  switch (output.type) {
    case 'error':
      return output.error.message || `${toolName} failed with no message`;
    case 'interrupted': {
      const message = `The ${toolName} call was interrupted before it finished.`;
      if (output.partial == null) return message;
      return `${message}\nPartial output before the interruption:\n${JSON.stringify(output.partial.raw)}`;
    }
    case 'denied':
      return output.reason || `The ${toolName} call was denied.`;
    case 'suspended':
      /*
       * TODO: A suspended call waits for a tool approval or a client-side
       * tool result. Once the harness supports those, end the drive's turn
       * work instead, so the call resumes in a later drive.
       */
      return output.reason === 'approval'
        ? `The ${toolName} call requires approval, which is not supported.`
        : `The ${toolName} tool must be executed by the client, which is not supported.`;
  }
}

/**
 * Returns an error tool result for libfx.
 */
export function toFxErrorResult(options: {
  /**
   * Text shown to the model.
   */
  text: string;
}): FxToolResult {
  return {
    type: 'libfx.tool-result',
    text: options.text,
    images: [],
    isError: true,
  };
}

/**
 * Returns whether a recorded tool value is a built-in tool output.
 */
function isBuiltinToolOutput(value: unknown): value is FxBuiltinToolOutput {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { text?: unknown }).text === 'string'
  );
}

/**
 * Converts the value of a successful tool call into what a libfx tool
 * returns.
 *
 * A built-in tool output becomes its text, or a typed `FxToolResult` when it
 * has images or is an error result. A value with model output (the tool's
 * `toModelOutput`) becomes a typed result with its texts joined by newlines
 * and its first 8 images. Any other value is returned as is: libfx sends a
 * string unchanged and any other value as JSON text. The conversion depends
 * only on the value, so replayed calls give libfx exactly what the original
 * calls gave it.
 */
function toFxValueResult(options: {
  /**
   * Value of the call.
   */
  value: HarnessV2ToolExecutionValue;

  /**
   * Whether the call was one of the harness's built-in tools.
   */
  builtin: boolean;
}): unknown {
  const { value, builtin } = options;
  if (builtin && isBuiltinToolOutput(value.raw)) {
    const { text, images, isError } = value.raw;
    if ((images == null || images.length === 0) && isError !== true) {
      return text;
    }
    const result: FxToolResult = {
      type: 'libfx.tool-result',
      text,
      images: (images ?? []).slice(0, MAX_RESULT_IMAGES).map(image => ({
        type: 'image',
        mimeType: image.mediaType,
        data: image.data,
      })),
    };
    if (isError === true) result.isError = true;
    return result;
  }
  if (value.modelOutput != null) {
    const converted = convertHarnessToolModelOutput({
      output: normalizeHarnessToolModelOutput({ output: value.modelOutput }),
    });
    const result: FxToolResult = {
      type: 'libfx.tool-result',
      text: converted.content
        .flatMap(part => (part.type === 'text' ? [part.text] : []))
        .join('\n'),
      images: converted.content
        .flatMap(part =>
          part.type === 'image'
            ? [
                {
                  type: 'image' as const,
                  mimeType: part.mediaType,
                  data: part.data,
                },
              ]
            : [],
        )
        .slice(0, MAX_RESULT_IMAGES),
    };
    if (converted.isError) result.isError = true;
    return result;
  }
  return value.raw;
}

/**
 * Converts the outcome of a tool call into what a libfx tool returns. Any
 * outcome other than a result, and a missing outcome (a call replayed from
 * the log without a recorded outcome), becomes an error result.
 */
export function toFxToolResult(options: {
  /**
   * Outcome of the call, if one is known.
   */
  output?: HarnessV2ToolExecutionOutput;

  /**
   * Name of the called tool.
   */
  toolName: string;

  /**
   * Whether the call was one of the harness's built-in tools.
   */
  builtin: boolean;
}): unknown {
  const { output, toolName, builtin } = options;
  if (output == null) {
    return toFxErrorResult({
      text: `The ${toolName} call has no recorded result.`,
    });
  }
  if (output.type === 'result') {
    return toFxValueResult({ value: output.value, builtin });
  }
  return toFxErrorResult({ text: describeToolFailure({ output, toolName }) });
}
