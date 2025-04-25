import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { NextRequest } from 'next/server';
import { Readable } from 'stream';

export async function convertNextRequestToIncomingMessage(
  request: NextRequest,
): Promise<IncomingMessage> {
  const method = request.method;
  const url = request.url;
  const headers = Object.fromEntries(request.headers);
  const contentType = request.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await request.json()
    : await request.text();
  const socket = new Socket();

  // Create a readable stream that will be used as the base for IncomingMessage
  const readable = new Readable();
  readable._read = (): void => {}; // Required implementation

  // Add the body content if provided
  if (body) {
    if (typeof body === 'string') {
      readable.push(body);
    } else if (Buffer.isBuffer(body)) {
      readable.push(body);
    } else {
      // Ensure proper JSON-RPC format
      const bodyString = JSON.stringify(body);
      readable.push(bodyString);
    }
    readable.push(null); // Signal the end of the stream
  } else {
    readable.push(null); // Always end the stream even if no body
  }

  // Create the IncomingMessage instance
  const req = new IncomingMessage(socket);

  // Set the properties
  req.method = method;
  req.url = url;
  req.headers = headers;

  // Copy over the stream methods
  req.push = readable.push.bind(readable);
  req.read = readable.read.bind(readable);

  // @ts-expect-error
  req.on = readable.on.bind(readable);
  req.pipe = readable.pipe.bind(readable);

  return req;
}
