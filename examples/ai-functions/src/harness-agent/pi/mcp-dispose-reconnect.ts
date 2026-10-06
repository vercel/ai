import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { run } from '../../lib/run';
import { createPi } from './_create';

// Destroying a session must not reconnect to eager MCP servers.
run(async () => {
  let initializeRequests = 0;
  const mcpServer = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    if (message.id == null) {
      res.writeHead(202).end();
      return;
    }
    if (message.method === 'initialize') initializeRequests++;
    const result =
      message.method === 'initialize'
        ? {
            protocolVersion: message.params.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'counter', version: '1.0.0' },
          }
        : message.method === 'tools/list'
          ? { tools: [] }
          : {};
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise<void>(resolve => mcpServer.listen(0, resolve));
  const { port } = mcpServer.address() as AddressInfo;

  const staleErrors: string[] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => {
    const text = args.map(String).join(' ');
    if (text.includes('extension ctx is stale')) staleErrors.push(text);
    consoleError(...args);
  };

  const agent = new HarnessAgent({
    harness: createPi({
      mcpServers: {
        counter: {
          url: `http://127.0.0.1:${port}/mcp`,
          auth: false,
          lifecycle: 'eager',
        },
      },
    }),
  });
  const sandboxSession = await createJustBashNetworkSandboxSession({
    cwd: '/home/user',
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.generate({
      session,
      prompt: 'Reply with the single word: ok',
    });
    console.log('text:', result.text);
    console.log('initialize requests before destroy:', initializeRequests);
    const before = initializeRequests;

    await session.destroy();
    session = undefined;
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('initialize requests after destroy:', initializeRequests);
    console.log('stale ctx errors:', staleErrors.length);
    if (initializeRequests !== before || staleErrors.length > 0) {
      throw new Error('Destroying the session reconnected the MCP server.');
    }
  } finally {
    console.error = consoleError;
    await session?.destroy();
    await sandboxSession.destroy();
    mcpServer.close();
  }
});
