#!/usr/bin/env node
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createMCPClient } from '../packages/mcp/dist/index.js';

const serverEvents = [];

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body === '' ? undefined : JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function writeJson(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function writeSseMessage(res, message) {
  res.write(`event: message\n`);
  res.write(`data: ${JSON.stringify(message)}\n\n`);
}

const server = createServer(async (req, res) => {
  try {
    if (req.url !== '/mcp') {
      res.writeHead(404).end();
      return;
    }

    if (req.method === 'GET') {
      // This reproduction uses the Streamable HTTP POST response stream for the
      // tool call, which is where FastMCP-style log notifications may arrive.
      // Returning 405 makes the optional long-lived GET SSE stream unavailable.
      res.writeHead(405).end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }

    const message = await readJson(req);
    serverEvents.push(message);

    if (message.method === 'initialize') {
      writeJson(
        res,
        200,
        {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: {
              tools: {},
              logging: {},
            },
            serverInfo: {
              name: 'issue-14693-repro-server',
              version: '1.0.0',
            },
          },
        },
        { 'mcp-session-id': 'issue-14693-session' },
      );
      return;
    }

    if (message.method === 'notifications/initialized') {
      res.writeHead(202).end();
      return;
    }

    if (message.method === 'tools/list') {
      writeJson(res, 200, {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'list_gmail_emails',
              description: 'Minimal tool used to reproduce MCP log delivery.',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
          ],
        },
      });
      return;
    }

    if (message.method === 'tools/call') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });

      // This is the server-initiated notification emitted by MCP servers for
      // log.info('listing emails') during tool execution.
      writeSseMessage(res, {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: {
          level: 'info',
          data: 'listing emails',
          logger: 'issue-14693-repro-server',
        },
      });

      writeSseMessage(res, {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: 'ok' }],
        },
      });
      res.end();
      return;
    }

    writeJson(res, 500, {
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32601, message: `Unhandled method ${message.method}` },
    });
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(error instanceof Error ? error.stack : String(error));
  }
});

const port = await new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const onmessageMessages = [];
const uncaughtErrors = [];

let client;
try {
  client = await createMCPClient({
    transport: {
      type: 'http',
      url: `http://127.0.0.1:${port}/mcp`,
      onmessage(message) {
        onmessageMessages.push(message);
        console.log('Message received:', JSON.stringify(message));
      },
    },
    onUncaughtError(error) {
      uncaughtErrors.push(error);
    },
  });

  const tools = await client.tools();
  const result = await tools.list_gmail_emails.execute({}, {});

  console.log('tool result:', JSON.stringify(result));
  console.log('transport config onmessage calls:', onmessageMessages.length);
  console.log(
    'uncaught client errors:',
    uncaughtErrors.map(error =>
      error instanceof Error ? error.message : String(error),
    ),
  );
  console.log(
    'server saw methods:',
    serverEvents.map(event => event.method).join(', '),
  );

  assert.equal(result.content[0].text, 'ok');
  assert.ok(
    onmessageMessages.some(
      message =>
        message.method === 'notifications/message' &&
        message.params?.data === 'listing emails',
    ),
    'Expected transport config onmessage to receive notifications/message with data "listing emails", but it was never called.',
  );
} finally {
  await client?.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
