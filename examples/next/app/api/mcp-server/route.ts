import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { EventEmitter } from 'events';
import { NextRequest } from 'next/server';
import { Readable } from 'stream';
import { z } from 'zod';

async function convertNextRequestToIncomingMessage(
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

  const readable = new Readable();
  readable._read = (): void => {};

  if (body) {
    if (typeof body === 'string') {
      readable.push(body);
    } else if (Buffer.isBuffer(body)) {
      readable.push(body);
    } else {
      const bodyString = JSON.stringify(body);
      readable.push(bodyString);
    }
    readable.push(null);
  } else {
    readable.push(null);
  }

  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.push = readable.push.bind(readable);
  req.read = readable.read.bind(readable);
  // @ts-expect-error
  req.on = readable.on.bind(readable);
  req.pipe = readable.pipe.bind(readable);

  return req;
}

function createServerResponseAdapter(
  signal: AbortSignal,
  fn: (res: ServerResponse) => Promise<void> | void,
): Promise<Response> {
  let writeHeadResolver: (v: {
    statusCode: number;
    headers?: Record<string, string>;
  }) => void;
  const writeHeadPromise = new Promise<{
    statusCode: number;
    headers?: Record<string, string>;
  }>(async (resolve, _reject) => {
    writeHeadResolver = resolve;
  });

  return new Promise(async (resolve, _reject) => {
    let controller: ReadableStreamController<Uint8Array> | undefined;
    let shouldClose = false;
    let wroteHead = false;

    const writeHead = (
      statusCode: number,
      headers?: Record<string, string>,
    ) => {
      if (typeof headers === 'string') {
        throw new Error('Status message of writeHead not supported');
      }

      wroteHead = true;
      writeHeadResolver({
        statusCode,
        headers,
      });

      return fakeServerResponse;
    };

    let bufferedData: Uint8Array[] = [];

    const write = (
      chunk: Buffer | string,
      encoding?: BufferEncoding,
    ): boolean => {
      if (encoding) {
        throw new Error('Encoding not supported');
      }
      if (chunk instanceof Buffer) {
        throw new Error('Buffer not supported');
      }
      if (!wroteHead) {
        writeHead(200);
      }
      if (!controller) {
        bufferedData.push(new TextEncoder().encode(chunk as string));
        return true;
      }
      controller.enqueue(new TextEncoder().encode(chunk as string));
      return true;
    };

    const eventEmitter = new EventEmitter();

    const fakeServerResponse = {
      writeHead,
      write,
      end: (data?: Buffer | string) => {
        if (data) {
          write(data);
        }

        if (!controller) {
          shouldClose = true;
          return fakeServerResponse;
        }
        try {
          controller.close();
        } catch {
          /* May be closed on tcp layer */
        }
        return fakeServerResponse;
      },
      on: (event: string, listener: (...args: any[]) => void) => {
        eventEmitter.on(event, listener);
        return fakeServerResponse;
      },
      flushHeaders: () => {
        return fakeServerResponse;
      },
    };

    signal.addEventListener('abort', () => {
      eventEmitter.emit('close');
    });

    fn(fakeServerResponse as unknown as ServerResponse);

    const head = await writeHeadPromise;

    const response = new Response(
      new ReadableStream({
        start(c) {
          controller = c;
          for (const chunk of bufferedData) {
            controller.enqueue(chunk);
          }
          if (shouldClose) {
            controller.close();
          }
        },
      }),
      {
        status: head.statusCode,
        headers: head.headers,
      },
    );

    resolve(response);
  });
}

function createMcpServer() {
  const server = new McpServer({
    name: 'example-tool-title-server',
    version: '1.0.0',
  });

  server.tool(
    'get_weather',
    'Get the current weather for a location',
    {
      location: z
        .string()
        .describe('The city and country, e.g., "Paris, France"'),
      unit: z
        .enum(['celsius', 'fahrenheit'])
        .optional()
        .describe('Temperature unit'),
    },
    {
      title: '🌤️ Weather Information',
    },
    async ({
      location,
      unit = 'celsius',
    }: {
      location: string;
      unit?: 'celsius' | 'fahrenheit';
    }) => {
      const temp = unit === 'celsius' ? 22 : 72;
      const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy'];
      const condition =
        conditions[Math.floor(Math.random() * conditions.length)];

      return {
        content: [
          {
            type: 'text',
            text: `Weather in ${location}: ${condition}, ${temp}°${unit === 'celsius' ? 'C' : 'F'}`,
          },
        ],
      };
    },
  );

  server.tool(
    'calculate',
    'Perform basic arithmetic calculations',
    {
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    },
    { title: '🔢 Calculator' },
    async ({
      operation,
      a,
      b,
    }: {
      operation: 'add' | 'subtract' | 'multiply' | 'divide';
      a: number;
      b: number;
    }) => {
      let result: number = 0;
      switch (operation) {
        case 'add':
          result = a + b;
          break;
        case 'subtract':
          result = a - b;
          break;
        case 'multiply':
          result = a * b;
          break;
        case 'divide':
          if (b === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: Division by zero',
                },
              ],
            };
          }
          result = a / b;
          break;
      }

      return {
        content: [
          {
            type: 'text',
            text: `${a} ${operation} ${b} = ${result}`,
          },
        ],
      };
    },
  );

  server.tool(
    'get_current_time',
    'Get the current date and time',
    {
      timezone: z
        .string()
        .optional()
        .describe('Timezone, e.g., "America/New_York"'),
    },
    { title: '🕐 Current Time' },
    async ({ timezone }: { timezone?: string }) => {
      const now = new Date();
      const timeString = timezone
        ? now.toLocaleString('en-US', { timeZone: timezone })
        : now.toLocaleString();

      return {
        content: [
          {
            type: 'text',
            text: `Current time${timezone ? ` in ${timezone}` : ''}: ${timeString}`,
          },
        ],
      };
    },
  );

  return server;
}

async function mcpApiHandler(req: NextRequest, res: ServerResponse) {
  if (req.method === 'POST') {
    const server = createMcpServer();
    const statelessTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(statelessTransport);

    const incomingMessage = await convertNextRequestToIncomingMessage(req);
    await statelessTransport.handleRequest(incomingMessage, res);
  } else {
    res.statusCode = 405;
    res.end('Method not allowed');
  }
}

const requestHandler = (req: NextRequest) => {
  return createServerResponseAdapter(req.signal, res => {
    mcpApiHandler(req, res);
  });
};

export {
  requestHandler as DELETE,
  requestHandler as GET,
  requestHandler as POST,
};
