import { WebSocket, type RawData } from 'ws';

const maxBufferedBytes = 1024 * 1024;

function bytes(data: RawData): Buffer {
  return Buffer.isBuffer(data)
    ? data
    : Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.from(data);
}

export function relayLiveConnection(client: WebSocket, upstream: WebSocket) {
  const queued: Buffer[] = [];
  let queuedBytes = 0;
  let stopped = false;
  const timeout = setTimeout(
    () => stop(1011, 'Relay session timed out'),
    10 * 60 * 1000,
  );

  // Never expose upstream error messages or close reasons to the browser.
  const stop = (code: number, reason: string, clientShutdown = false) => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timeout);
    queued.length = 0;
    queuedBytes = 0;
    if (upstream.readyState === WebSocket.OPEN && clientShutdown)
      upstream.close(1000, 'Client closed');
    else if (upstream.readyState !== WebSocket.CLOSED) upstream.terminate();
    if (client.readyState === WebSocket.OPEN) client.close(code, reason);
  };
  const failed = () => stop(1011, 'Relay connection failed');
  const overloaded = () => stop(1013, 'Relay overloaded');
  const forward = (target: WebSocket, data: Buffer) => {
    if (stopped || target.readyState !== WebSocket.OPEN) return;
    if (target.bufferedAmount + data.byteLength > maxBufferedBytes) {
      overloaded();
      return;
    }
    try {
      target.send(data, { binary: false }, error => {
        if (error != null) failed();
      });
    } catch {
      failed();
    }
  };
  client.on('message', (data, binary) => {
    if (stopped) return;
    if (binary) return stop(1011, 'Relay requires text frames');
    const frame = bytes(data);
    if (upstream.readyState === WebSocket.OPEN) forward(upstream, frame);
    else if (upstream.readyState === WebSocket.CONNECTING) {
      queuedBytes += frame.byteLength;
      if (queuedBytes > maxBufferedBytes) return overloaded();
      queued.push(frame);
    } else failed();
  });
  upstream.on('open', () => {
    for (const data of queued) {
      if (stopped) break;
      forward(upstream, data);
    }
    queued.length = 0;
    queuedBytes = 0;
  });
  upstream.on('message', (data, binary) => {
    if (stopped) return;
    if (binary) return stop(1011, 'Relay requires text frames');
    forward(client, bytes(data));
  });
  client.on('error', failed);
  client.on('close', code => {
    if (code === 1000 || code === 1001) stop(1000, 'Client closed', true);
    else failed();
  });
  upstream.on('error', failed);
  upstream.on('close', code => {
    if (code === 1000) stop(1000, 'Upstream closed');
    else if (code === 1013) overloaded();
    else failed();
  });
}
