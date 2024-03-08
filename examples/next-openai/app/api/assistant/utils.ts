export async function createRun(
  threadId: string,
  params: {
    stream: true;
    assistant_id: string;
  },
) {
  const response = await fetch(
    `https://api.openai.com/v1/threads/${threadId}/runs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v1',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(params),
    },
  );

  if (response.body == null) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .pipeThrough(new OpenAIAssistantStream());
}

export async function submitToolOutputs(
  threadId: string,
  runId: string,
  params: { stream: true; tool_outputs: any },
) {
  const response = await fetch(
    `https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v1',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(params),
    },
  );

  if (response.body == null) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .pipeThrough(new OpenAIAssistantStream());
}

export class OpenAIAssistantStream extends TransformStream<
  XEvent,
  AssistantEvent
> {
  constructor() {
    super({
      transform({ event, data }, controller) {
        // console.log('event', event, 'data', JSON.stringify(data, null, 2));

        switch (event) {
          case 'thread.message.created': {
            const parsedData = JSON.parse(data);

            controller.enqueue({
              event: 'thread.message.created',
              messageId: parsedData.id,
              messageRole: parsedData.role,
            });

            break;
          }

          case 'thread.message.delta': {
            const parsedData = JSON.parse(data);

            // TODO assuming single msg for now
            const delta = parsedData.delta.content[0].text.value;

            controller.enqueue({
              event: 'thread.message.delta',
              delta,
            });

            break;
          }

          case 'thread.run.completed':
          case 'thread.run.requires_action': {
            const parsedData = JSON.parse(data);

            controller.enqueue({
              event: event as
                | 'thread.run.completed'
                | 'thread.run.requires_action',
              data: parsedData,
            });

            break;
          }
        }
      },
    });
  }
}

export type AssistantEvent =
  | {
      event: 'thread.message.delta';
      delta: string;
    }
  | {
      event: 'thread.message.created';
      messageId: string;
      messageRole: string;
    }
  | {
      event: 'thread.run.requires_action' | 'thread.run.completed';
      data: any;
    };

let buffer = '';

export class EventSourceParserStream extends TransformStream<string, XEvent> {
  constructor() {
    super({
      start() {
        buffer = '';
      },
      transform(chunk, controller) {
        buffer += chunk;

        // split by \n\n
        const parts = buffer.split('\n\n');

        // if last part is not complete, buffer it
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          controller.enqueue(processPart(part));
        }
      },
      flush(controller) {
        if (buffer) {
          controller.enqueue(processPart(buffer));
        }
      },
    });
  }
}

export interface XEvent {
  event?: string;
  data: string;
}

function processPart(part: string) {
  const lines = part.split('\n').filter(line => line.trim() !== '');

  const event: XEvent = { data: '' };

  for (const line of lines) {
    // split at the first colon:
    const separatorIndex = line.indexOf(':');
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === 'event') {
      event.event = value.trim();
    } else if (key === 'data') {
      event.data = value.trim();
    }
  }

  return event;
}
