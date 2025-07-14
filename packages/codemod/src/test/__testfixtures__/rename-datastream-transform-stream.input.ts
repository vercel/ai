// @ts-nocheck
import { DataStreamToSSETransformStream } from 'ai';
import { DataStreamToSSETransformStream as StreamTransform } from 'ai';
import { streamText, DataStreamToSSETransformStream as SSEStream } from 'ai';

// Type annotations
function createTransform(): DataStreamToSSETransformStream {
  return new DataStreamToSSETransformStream();
}

// With aliased import
function processStream(transform: StreamTransform): void {
  console.log(transform);
}

// Array type
const transformArray: DataStreamToSSETransformStream[] = [];

// Union type
type StreamOrString = DataStreamToSSETransformStream | string;

// Interface extending
interface CustomTransform extends DataStreamToSSETransformStream {
  customMethod(): void;
}

// Generic type usage
type TransformWrapper<T = DataStreamToSSETransformStream> = {
  stream: T;
};

// Object property type
interface StreamProcessor {
  transform: DataStreamToSSETransformStream;
  process: (stream: DataStreamToSSETransformStream) => void;
}

// Constructor usage
const myStream = new DataStreamToSSETransformStream();

// Mixed with other imports from 'ai'
function createSSEStream(): DataStreamToSSETransformStream {
  return streamText({ 
    model: 'gpt-3.5-turbo',
    prompt: 'Hello'
  }).toDataStreamResponse().body?.pipeThrough(new DataStreamToSSETransformStream()) as any;
}

// Type alias
type MyStreamTransform = DataStreamToSSETransformStream;

// With aliased import usage
function handleAliased(stream: SSEStream): void {
  console.log(stream);
}

// From other packages (should not transform)
import { DataStreamToSSETransformStream as OtherStream } from 'other-package';
function handleOther(stream: OtherStream): void {
  console.log(stream);
} 