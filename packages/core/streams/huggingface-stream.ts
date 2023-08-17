import {
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
  trimStartOfStreamHelper
} from './ai-stream'
import { createStreamDataTransformer } from './stream-data'

function createParser(res: AsyncGenerator<any>) {
  const trimStartOfStream = trimStartOfStreamHelper()
  return new ReadableStream<string>({
    async pull(controller): Promise<void> {
      const { value, done } = await res.next()
      if (done) {
        controller.close()
        return
      }

      const text = trimStartOfStream(value.token?.text ?? '')
      if (!text) return

      // some HF models return generated_text instead of a real ending token
      if (value.generated_text != null && value.generated_text.length > 0) {
        controller.close()
        return
      }

      // <|endoftext|> is for https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5
      // <|end|> is for https://huggingface.co/HuggingFaceH4/starchat-beta
      // </s> is also often last token in the stream depending on the model
      if (text === '</s>' || text === '<|endoftext|>' || text === '<|end|>') {
        controller.close()
      } else {
        controller.enqueue(text)
      }
    }
  })
}

export function HuggingFaceStream(
  res: AsyncGenerator<any>,
  callbacks?: AIStreamCallbacksAndOptions
): ReadableStream {
  return createParser(res)
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(
      createStreamDataTransformer(callbacks?.experimental_streamData)
    )
}
