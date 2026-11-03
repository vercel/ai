import { isToolOutputErrorUIPart, type UIDataTypes, type UIMessage } from 'ai';

type WeatherTools = {
  weather: {
    input: { city: string };
    output: { temperature: number };
  };
};

const message: UIMessage<unknown, UIDataTypes, WeatherTools> = {
  id: 'message-1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-weather',
      toolCallId: 'call-1',
      state: 'output-error',
      input: { city: 'Berlin' },
      errorText: 'Weather service unavailable',
    },
  ],
};

for (const part of message.parts) {
  if (isToolOutputErrorUIPart(part)) {
    console.log(`Tool failed: ${part.errorText}`);
  }
}
