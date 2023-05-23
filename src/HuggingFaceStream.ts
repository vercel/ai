// import { type TextGenerationStreamOutput } from "@huggingface/inference";
import { AIStreamCallbacks } from './AIStream';

export function HuggingFaceStream(
  res: AsyncGenerator<any>,
  callbacks?: AIStreamCallbacks
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let counter = 0;
  const stream = new ReadableStream({
    async start(controller): Promise<void> {
      for await (const chunk of res) {
        const text = chunk.token?.text ?? '';
        // some HF models return generated_text instead of a real ending token
        if (chunk.generated_text != null && chunk.generated_text.length > 0) {
          controller.close();
          return;
        }

        // <|endoftext|> is for https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5
        // </s> is also often last token in the stream depending on the model
        if (text !== '</s>' && text !== '<|endoftext|>') {
          if (counter < 2 && (text.match(/\n/) || []).length) {
            return;
          }

          const queue = encoder.encode(JSON.stringify(text) + '\n');
          controller.enqueue(queue);
          counter++;
        } else {
          controller.close();
          return;
        }
      }
    },
  });

  let fullResponse = '';
  const forkedStream = new TransformStream({
    start: async () => {
      if (callbacks?.onStart) {
        await callbacks?.onStart();
      }
    },
    transform: async (chunk, controller) => {
      controller.enqueue(chunk);
      const item = decoder.decode(chunk);
      const value = JSON.parse(item.split('\n')[0]);
      if (callbacks?.onToken) {
        await callbacks?.onToken(value);
      }
      fullResponse += value;
    },
    flush: async (controller) => {
      if (callbacks?.onCompletion) {
        await callbacks?.onCompletion(fullResponse);
      }
      controller.terminate();
    },
  });
  return stream.pipeThrough(forkedStream);
}
