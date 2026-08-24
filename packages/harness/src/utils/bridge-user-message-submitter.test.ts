import { describe, expect, it, vi } from 'vitest';
import {
  experimental_createBridgeUserMessageSubmitter,
  type Experimental_BridgeUserMessageRequest,
  type Experimental_BridgeUserMessageResponse,
} from './bridge-user-message-submitter';

function setup() {
  const sent: Experimental_BridgeUserMessageRequest[] = [];
  let responseListener:
    | ((response: Experimental_BridgeUserMessageResponse) => void)
    | undefined;
  let reconnectListener: (() => void) | undefined;
  const unsubscribeResponse = vi.fn();
  const unsubscribeReconnect = vi.fn();
  const submitter = experimental_createBridgeUserMessageSubmitter({
    send: message => sent.push(message),
    onResponse: listener => {
      responseListener = listener;
      return unsubscribeResponse;
    },
    onReconnect: listener => {
      reconnectListener = listener;
      return unsubscribeReconnect;
    },
  });
  return {
    submitter,
    sent,
    respond: (response: Experimental_BridgeUserMessageResponse) =>
      responseListener?.(response),
    reconnect: () => reconnectListener?.(),
    unsubscribeResponse,
    unsubscribeReconnect,
  };
}

describe('experimental_createBridgeUserMessageSubmitter', () => {
  it('resolves only after the matching acceptance response', async () => {
    const { submitter, sent, respond } = setup();
    const steering = submitter.submit('Change course.');
    let settled = false;
    void steering.finally(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(sent[0]).toMatchObject({
      type: 'user-message',
      text: 'Change course.',
    });
    expect(sent[0]?.messageId).toEqual(expect.any(String));

    respond({
      type: 'user-message-response',
      messageId: sent[0]!.messageId,
      accepted: true,
    });
    await expect(steering).resolves.toBeUndefined();
  });

  it('surfaces a runtime rejection', async () => {
    const { submitter, sent, respond } = setup();
    const steering = submitter.submit('Change course.');
    respond({
      type: 'user-message-response',
      messageId: sent[0]!.messageId,
      accepted: false,
      error: { message: 'Turn already finished.' },
    });

    await expect(steering).rejects.toThrow('Turn already finished.');
  });

  it('retries pending messages with the same id after reconnect', () => {
    const { submitter, sent, reconnect } = setup();
    void submitter.submit('Change course.');
    reconnect();

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
  });

  it('rejects pending and future messages when closed', async () => {
    const { submitter, unsubscribeResponse, unsubscribeReconnect } = setup();
    const steering = submitter.submit('Change course.');
    submitter.close(new Error('Turn ended.'));

    await expect(steering).rejects.toThrow('Turn ended.');
    await expect(submitter.submit('Again.')).rejects.toThrow(
      'no longer accepting',
    );
    expect(unsubscribeResponse).toHaveBeenCalledOnce();
    expect(unsubscribeReconnect).toHaveBeenCalledOnce();
  });
});
