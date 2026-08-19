export type BridgeUserMessageRequest = {
  type: 'user-message';
  messageId: string;
  text: string;
};

export type BridgeUserMessageResponse = {
  type: 'user-message-response';
  messageId: string;
  accepted: boolean;
  error?: { message: string };
};

export type BridgeUserMessageSubmitter = {
  submit(text: string): Promise<void>;
  close(error?: unknown): void;
};

export function createBridgeUserMessageSubmitter(options: {
  send(message: BridgeUserMessageRequest): void;
  onResponse(
    listener: (response: BridgeUserMessageResponse) => void,
  ): () => void;
  onReconnect(listener: () => void): () => void;
}): BridgeUserMessageSubmitter {
  const pending = new Map<
    string,
    {
      request: BridgeUserMessageRequest;
      resolve(): void;
      reject(error: unknown): void;
    }
  >();
  let closed = false;

  const send = (request: BridgeUserMessageRequest): void => {
    try {
      options.send(request);
    } catch (error) {
      const entry = pending.get(request.messageId);
      if (entry == null) return;
      pending.delete(request.messageId);
      entry.reject(error);
    }
  };

  const unsubscribeResponse = options.onResponse(response => {
    const entry = pending.get(response.messageId);
    if (entry == null) return;
    pending.delete(response.messageId);
    if (response.accepted) {
      entry.resolve();
    } else {
      entry.reject(
        new Error(
          response.error?.message ?? 'The runtime rejected the user message.',
        ),
      );
    }
  });
  const unsubscribeReconnect = options.onReconnect(() => {
    for (const entry of pending.values()) send(entry.request);
  });

  return {
    submit: text => {
      if (closed) {
        return Promise.reject(
          new Error('The bridge turn is no longer accepting user messages.'),
        );
      }
      const messageId = crypto.randomUUID();
      const request: BridgeUserMessageRequest = {
        type: 'user-message',
        messageId,
        text,
      };
      const promise = new Promise<void>((resolve, reject) => {
        pending.set(messageId, { request, resolve, reject });
      });
      send(request);
      return promise;
    },
    close: error => {
      if (closed) return;
      closed = true;
      unsubscribeResponse();
      unsubscribeReconnect();
      const reason =
        error ??
        new Error('The bridge turn ended before accepting the user message.');
      for (const entry of pending.values()) entry.reject(reason);
      pending.clear();
    },
  };
}
