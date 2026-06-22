import {
  createModelCallToUIChunkTransform,
  type ModelCallStreamPart,
} from '@ai-sdk/workflow';

export function toUIMessageStream(
  readable: ReadableStream<ModelCallStreamPart>,
) {
  return readable.pipeThrough(createModelCallToUIChunkTransform());
}
