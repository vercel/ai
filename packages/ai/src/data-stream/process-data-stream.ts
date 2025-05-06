import {
  createEventSourceParserStream,
  EventSourceChunk,
  ParseResult,
  safeParseJSON,
  ToolCall,
  ToolResult,
} from '@ai-sdk/provider-utils';
import {
  DataStreamPart,
  dataStreamPartSchema,
} from '../../src/data-stream/data-stream-parts';
import { createAsyncIterableStream } from '../../core/util/async-iterable-stream';

export async function processDataStream({
  stream,
  onTextPart,
  onReasoningPart,
  onReasoningPartFinish,
  onSourcePart,
  onFilePart,
  onDataPart,
  onErrorPart,
  onToolCallStreamingStartPart,
  onToolCallDeltaPart,
  onToolCallPart,
  onToolResultPart,
  onMessageAnnotationsPart,
  onFinishMessagePart,
  onFinishStepPart,
  onStartStepPart,
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
  onDataPart?: (
    streamPart: (DataStreamPart & { type: 'data' })['value'],
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
  onMessageAnnotationsPart?: (
    streamPart: (DataStreamPart & {
      type: 'message-annotations';
    })['value'],
  ) => Promise<void> | void;
  onFinishMessagePart?: (
    streamPart: (DataStreamPart & { type: 'finish-message' })['value'],
  ) => Promise<void> | void;
  onFinishStepPart?: (
    streamPart: (DataStreamPart & { type: 'finish-step' })['value'],
  ) => Promise<void> | void;
  onStartStepPart?: (
    streamPart: (DataStreamPart & { type: 'start-step' })['value'],
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
      throw new Error('Failed to parse data stream part');
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
      case 'data':
        await onDataPart?.(value);
        break;
      case 'error':
        await onErrorPart?.(value);
        break;
      case 'message-annotations':
        await onMessageAnnotationsPart?.(value);
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
      case 'finish-message':
        await onFinishMessagePart?.(value);
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
