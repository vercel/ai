import {
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
  readableFromAsyncIterable,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

interface AWSSageMakerResponse {
  Body?: AsyncIterable<{
    PayloadPart?: { Bytes?: Uint8Array };
  }>;
}

async function* asDeltaIterable(
  response: AWSSageMakerResponse,
  extractTextDeltaFromChunk: (chunk: any) => string,
) {
  const decoder = new TextDecoder();
  var prevChunkStr = ""
  for await (const chunk of response.Body ?? []) {
    const bytes = chunk.PayloadPart?.Bytes;
    if (bytes != null) {
      var chunkStr = decoder.decode(bytes);
      if (prevChunkStr === "") {
        // first chunk
        if (!chunkStr.trimEnd().endsWith("}")) {
          // start of multiple chunks
          prevChunkStr = chunkStr
          continue
        }
        // only one chunk
      } else if (!chunkStr.trimEnd().endsWith("}")) {
        // middle chunk
        prevChunkStr += chunkStr
        continue
      } else {
        // end chunk
        chunkStr = prevChunkStr + chunkStr
        prevChunkStr = ""
      }
      // parse JSON (exclude 'data:' prefix)
      const chunkObj = JSON.parse(chunkStr.trim().substring(5));
      const text = extractTextDeltaFromChunk(chunkObj.token);
      if (!text) return;

      // some HF models return generated_text instead of a real ending token
      if (chunkObj.token.generated_text != null && chunkObj.generated_text.length > 0) {
        return;
      }

      // <|endoftext|> is for https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5
      // <|end|> is for https://huggingface.co/HuggingFaceH4/starchat-beta
      // </s> is also often last token in the stream depending on the model
      if (text === '</s>' || text === '<|endoftext|>' || text === '<|end|>') {
        return;
      }

      yield text;
    }
  }
}

export function AWSSageMakerHuggingFaceStream(
  response: AWSSageMakerResponse,
  callbacks?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return AWSSageMakerStream(response, callbacks, chunk => chunk.text);
}

export function AWSSageMakerStream(
  response: AWSSageMakerResponse,
  callbacks: AIStreamCallbacksAndOptions | undefined,
  extractTextDeltaFromChunk: (chunk: any) => string,
) {
  return readableFromAsyncIterable(
    asDeltaIterable(response, extractTextDeltaFromChunk),
  )
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(
      createStreamDataTransformer(callbacks?.experimental_streamData),
    );
}
