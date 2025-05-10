import {
  createEventSourceParserStream,
  EventSourceChunk,
  ParseResult,
  safeParseJSON,
  ToolCall,
  ToolResult,
} from '@ai-sdk/provider-utils';
import { createAsyncIterableStream } from '../util/async-iterable-stream';
import { DataStreamPart, dataStreamPartSchema } from './data-stream-parts';
import { TypeValidationError } from '@ai-sdk/provider';

export async function processDataStream({
  stream,
  onTextPart,
  onReasoningPart,
  onReasoningPartFinish,
  onSourcePart,
  onFilePart,
  onErrorPart,
  onToolCallStreamingStartPart,
  onToolCallDeltaPart,
  onToolCallPart,
  onToolResultPart,
  onStartStepPart,
  onFinishStepPart,
  onStartPart,
  onFinishPart,
}: {
  stream: ReadableStream<Uint8Array>;
  onTextPart?: (
    streamPart: (DataStreamPart & { type: 'text' })['value'],
  ) => Promise<void> | void;
  onReasoningPart?: (
    streamPart: (DataStreamPart & { type: 'reasoning' })['value'],
  ) => Promise<void> | void;
  onReasoningPartFinish?: (
    streamPart: (DataStreamPart & {
      type: 'reasoning-part-finish';
    })['value'],
  ) => Promise<void> | void;
  onFilePart?: (
    streamPart: (DataStreamPart & { type: 'file' })['value'],
  ) => Promise<void> | void;
  onSourcePart?: (
    streamPart: (DataStreamPart & { type: 'source' })['value'],
  ) => Promise<void> | void;
  onErrorPart?: (
    streamPart: (DataStreamPart & { type: 'error' })['value'],
  ) => Promise<void> | void;
  onToolCallStreamingStartPart?: (
    streamPart: (DataStreamPart & {
      type: 'tool-call-streaming-start';
    })['value'],
  ) => Promise<void> | void;
  onToolCallDeltaPart?: (
    streamPart: (DataStreamPart & { type: 'tool-call-delta' })['value'],
  ) => Promise<void> | void;
  onToolCallPart?: (streamPart: ToolCall<string, any>) => Promise<void> | void;
  onToolResultPart?: (
    streamPart: ToolResult<string, any, any>,
  ) => Promise<void> | void;
  onStartStepPart?: (
    streamPart: (DataStreamPart & { type: 'start-step' })['value'],
  ) => Promise<void> | void;
  onFinishStepPart?: (
    streamPart: (DataStreamPart & { type: 'finish-step' })['value'],
  ) => Promise<void> | void;
  onStartPart?: (
    streamPart: (DataStreamPart & { type: 'start' })['value'],
  ) => Promise<void> | void;
  onFinishPart?: (
    streamPart: (DataStreamPart & { type: 'finish' })['value'],
  ) => Promise<void> | void;
}): Promise<void> {
  const streamParts = createAsyncIterableStream(
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(createEventSourceParserStream())
      .pipeThrough(
        new TransformStream<EventSourceChunk, ParseResult<DataStreamPart>>({
          async transform({ data }, controller) {
            if (data === '[DONE]') {
              return;
            }

            controller.enqueue(
              await safeParseJSON({
                text: data,
                schema: dataStreamPartSchema,
              }),
            );
          },
        }),
      ),
  );

  for await (const parseResult of streamParts) {
    if (!parseResult.success) {
      throw new TypeValidationError({
        value: parseResult.rawValue,
        cause: parseResult.error,
      });
    }

    const { type, value } = parseResult.value;

    switch (type) {
      case 'text':
        await onTextPart?.(value);
        break;
      case 'reasoning':
        await onReasoningPart?.(value);
        break;
      case 'reasoning-part-finish':
        await onReasoningPartFinish?.(value);
        break;
      case 'file':
        await onFilePart?.(value);
        break;
      case 'source':
        await onSourcePart?.(value);
        break;
      case 'error':
        await onErrorPart?.(value);
        break;
      case 'tool-call-streaming-start':
        await onToolCallStreamingStartPart?.(value);
        break;
      case 'tool-call-delta':
        await onToolCallDeltaPart?.(value);
        break;
      case 'tool-call':
        await onToolCallPart?.(value as ToolCall<string, any>);
        break;
      case 'tool-result':
        await onToolResultPart?.(value as ToolResult<string, any, any>);
        break;
      case 'start':
        await onStartPart?.(value);
        break;
      case 'finish':
        await onFinishPart?.(value);
        break;
      case 'finish-step':
        await onFinishStepPart?.(value);
        break;
      case 'start-step':
        await onStartStepPart?.(value);
        break;
      default: {
        const exhaustiveCheck: never = type;
        throw new Error(`Unknown stream part type: ${exhaustiveCheck}`);
      }
    }
  }
}
