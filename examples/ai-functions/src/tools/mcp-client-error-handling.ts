import { createServer } from 'node:http';
import { createMCPClient, MCPClientError } from '@ai-sdk/mcp';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const server = createServer((_request, response) => {
    response.writeHead(503, { 'content-type': 'text/plain' });
    response.end('Service Unavailable');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Failed to start the example MCP server');
  }

  try {
    await createMCPClient({
      transport: {
        type: 'http',
        url: `http://127.0.0.1:${address.port}/mcp`,
      },
    });
  } catch (error) {
    if (MCPClientError.isInstance(error)) {
      print('MCP failure:', {
        statusCode: error.statusCode,
        shouldRetry: error.statusCode == null || error.statusCode >= 500,
      });
      return;
    }

    throw error;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  throw new Error('Expected MCP client creation to fail');
});
