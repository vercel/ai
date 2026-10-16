import {
  isToolUIPart,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

type WeatherMessage = UIMessage<
  unknown,
  Record<string, never>,
  {
    getWeather: {
      input: { city: string };
      output: { temperature: number };
    };
  }
>;

const chunks: UIMessageChunk[] = [
  { type: 'start', messageId: 'message-1' },
  { type: 'start-step' },
  {
    type: 'tool-input-available',
    toolCallId: 'call-1',
    toolName: 'getWeather',
    input: { city: 'San Francisco' },
  },
  {
    type: 'tool-output-not-run',
    toolCallId: 'call-1',
    finishReason: 'length',
  },
  { type: 'finish-step' },
  { type: 'finish', finishReason: 'length' },
];

const stream = new ReadableStream<UIMessageChunk>({
  start(controller) {
    for (const chunk of chunks) {
      controller.enqueue(chunk);
    }
    controller.close();
  },
});

let finalMessage: WeatherMessage | undefined;

for await (const message of readUIMessageStream<WeatherMessage>({ stream })) {
  finalMessage = message;
}

const toolPart = finalMessage?.parts.find(isToolUIPart);

if (toolPart?.state === 'output-not-run') {
  const reason =
    toolPart.finishReason === 'length' ? 'output limit' : toolPart.finishReason;

  console.log(`Weather tool: Not run (${reason})`);
}
