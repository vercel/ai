// @ts-nocheck
import { JsonToSseTransformStream } from 'ai';
import { JsonToSseTransformStream as StreamTransform } from 'ai';
import { streamText, JsonToSseTransformStream as SSEStream } from 'ai';

// Type annotations
function createTransform(): JsonToSseTransformStream {
  return new JsonToSseTransformStream();
}

// With aliased import
function processStream(transform: StreamTransform): void {
  console.log(transform);
}

// Array type
const transformArray: JsonToSseTransformStream[] = [];

// Union type
type StreamOrString = JsonToSseTransformStream | string;

// Interface extending
interface CustomTransform extends JsonToSseTransformStream {
  customMethod(): void;
}

// Generic type usage
type TransformWrapper<T = JsonToSseTransformStream> = {
  stream: T;
};

// Object property type
interface StreamProcessor {
  transform: JsonToSseTransformStream;
  process: (stream: JsonToSseTransformStream) => void;
}

// Constructor usage
const myStream = new JsonToSseTransformStream();

// Mixed with other imports from 'ai'
function createSSEStream(): JsonToSseTransformStream {
  return streamText({ 
    model: 'gpt-3.5-turbo',
    prompt: 'Hello'
  }).toDataStreamResponse().body?.pipeThrough(new JsonToSseTransformStream()) as any;
}

// Type alias
type MyStreamTransform = JsonToSseTransformStream;

// With aliased import usage
function handleAliased(stream: SSEStream): void {
  console.log(stream);
}

// From other packages (should not transform)
import { DataStreamToSSETransformStream as OtherStream } from 'other-package';
function handleOther(stream: OtherStream): void {
  console.log(stream);
} 