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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  controller: ReadableStreamDefaultController;
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

  const counter = 0;

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const chunk of res.body as any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  let fullResponse = "";
  const forkedStream = new TransformStream({
    start: async (): Promise<void> => {
      if (callbacks?.onStart) {
        await callbacks.onStart();
      }
    },
    transform: async (chunk, controller): Promise<void> => {
      controller.enqueue(chunk);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const item = decoder.decode(chunk);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const value = JSON.parse(item.split("\n")[0]);
      if (callbacks?.onToken) {
        await callbacks.onToken(value as string);
      }
      fullResponse += value;
    },
    flush: async (controller): Promise<void> => {
      if (callbacks?.onCompletion) {
        await callbacks.onCompletion(fullResponse);
      }
      controller.terminate();
    },
  });
  return stream.pipeThrough(forkedStream);
}
