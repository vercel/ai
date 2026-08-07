import type { AnyMessage, Stream as ACPStream } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';
import { captureACPStream } from './acp-stream-capture';

describe('captureACPStream', () => {
  it('preserves a draft programmatic name before SDK validation strips it', async () => {
    const message = sessionUpdateMessage({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-1',
      title: 'Run command',
      name: 'shell',
    });
    const captured = captureACPStream({
      stream: streamFromMessages({ messages: [message] }),
    });

    expect(await readAll({ stream: captured.stream })).toEqual([message]);
    expect(
      captured.capture.takeForUpdate({
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call-1',
          title: 'Run command',
        },
      }),
    ).toEqual({
      precedingRawValues: [],
      rawUpdate: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-1',
        title: 'Run command',
        name: 'shell',
      },
    });
  });

  it('filters unknown session updates while preserving them for raw output', async () => {
    const message = sessionUpdateMessage({
      sessionUpdate: 'future_update',
      proprietary: { value: true },
    });
    const captured = captureACPStream({
      stream: streamFromMessages({ messages: [message] }),
    });

    expect(await readAll({ stream: captured.stream })).toEqual([]);
    expect(captured.capture.drainRawValues()).toEqual([
      {
        sessionUpdate: 'future_update',
        proprietary: { value: true },
      },
    ]);
  });

  it('returns filtered extension updates before the next validated update', async () => {
    const extension = sessionUpdateMessage({
      sessionUpdate: 'future_update',
      future: true,
    });
    const known = sessionUpdateMessage({
      sessionUpdate: 'agent_message_chunk',
      messageId: 'message-1',
      content: { type: 'text', text: 'hello' },
    });
    const captured = captureACPStream({
      stream: streamFromMessages({ messages: [extension, known] }),
    });

    expect(await readAll({ stream: captured.stream })).toEqual([known]);
    expect(
      captured.capture.takeForUpdate({
        update: {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'message-1',
          content: { type: 'text', text: 'hello' },
        },
      }),
    ).toEqual({
      precedingRawValues: [
        {
          sessionUpdate: 'future_update',
          future: true,
        },
      ],
      rawUpdate: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'message-1',
        content: { type: 'text', text: 'hello' },
      },
    });
  });

  it('forwards malformed known updates to SDK validation', async () => {
    const message = sessionUpdateMessage({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-1',
    });
    const captured = captureACPStream({
      stream: streamFromMessages({ messages: [message] }),
    });

    expect(await readAll({ stream: captured.stream })).toEqual([message]);
    expect(captured.capture.drainRawValues()).toEqual([
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-1',
      },
    ]);
  });

  it('does not filter an unknown discriminant from a malformed notification', async () => {
    const message = {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 42,
        update: {
          sessionUpdate: 'future_update',
        },
      },
    } as unknown as AnyMessage;
    const captured = captureACPStream({
      stream: streamFromMessages({ messages: [message] }),
    });

    expect(await readAll({ stream: captured.stream })).toEqual([message]);
    expect(captured.capture.drainRawValues()).toEqual([
      {
        sessionUpdate: 'future_update',
      },
    ]);
  });
});

function sessionUpdateMessage(update: Record<string, unknown>): AnyMessage {
  return {
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'session-1',
      update,
    },
  };
}

function streamFromMessages({
  messages,
}: {
  messages: ReadonlyArray<AnyMessage>;
}): ACPStream {
  return {
    readable: new ReadableStream({
      start(controller) {
        for (const message of messages) controller.enqueue(message);
        controller.close();
      },
    }),
    writable: new WritableStream(),
  };
}

async function readAll({
  stream,
}: {
  stream: ACPStream;
}): Promise<ReadonlyArray<AnyMessage>> {
  const messages: AnyMessage[] = [];
  const reader = stream.readable.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return messages;
      messages.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}
