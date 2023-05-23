import { AIStream, AIStreamCallbacks, AIStreamParserOptions } from "./AIStream";

function parseAnthropicStream({
  data,
  controller,
  counter,
  encoder,
}: AIStreamParserOptions) {
  try {
    const json = JSON.parse(data) as {
      completion: string;
      stop: string | null;
      stop_reason: string | null;
      truncated: boolean;
      log_id: string;
      model: string;
      exception: string | null;
    };
    const text = json.completion;
    if (counter < 2 && (text.match(/\n/) || []).length) {
      return;
    }

    const queue = encoder.encode(JSON.stringify(text) + "\n");
    controller.enqueue(queue);
    counter++;
  } catch (e) {
    controller.error(e);
  }
}

export function AnthropicStream(res: Response, cb?: AIStreamCallbacks) {
  return AIStream(res, parseAnthropicStream, cb);
}
