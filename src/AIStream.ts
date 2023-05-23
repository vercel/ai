import {
  createParser,
  type ParsedEvent,
  type ReconnectInterval,
} from "eventsource-parser";

export interface AIStreamCallbacks {
  onStart?: () => Promise<void>;
  onCompletion?: (completion: string) => Promise<void>;
  onToken?: (token: string) => Promise<void>;
}

export interface AIStreamParserOptions {
  data: any;
  controller: ReadableStreamDefaultController<any>;
  counter: number;
  encoder: TextEncoder;
}

export function AIStream(
  res: Response,
  customParser: (opts: AIStreamParserOptions) => void,
  callbacks?: AIStreamCallbacks
): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let counter = 0;

  const stream = new ReadableStream({
    async start(controller): Promise<void> {
      function onParse(event: ParsedEvent | ReconnectInterval): void {
        if (event.type === "event") {
          const data = event.data;
          if (data === "[DONE]") {
            controller.close();
            return;
          }
          return customParser({ data, controller, counter, encoder });
        }
      }

      const parser = createParser(onParse);

      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  let fullResponse = "";
  const forkedStream = new TransformStream({
    start: async () => {
      if (callbacks?.onStart) {
        await callbacks?.onStart();
      }
    },
    transform: async (chunk, controller) => {
      controller.enqueue(chunk);
      const item = decoder.decode(chunk);
      const value = JSON.parse(item.split("\n")[0]);
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
