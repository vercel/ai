import assert from 'node:assert/strict';
import {
  createMCPClient,
  type CallToolResult,
  type MCPTransport,
} from '@ai-sdk/mcp';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const data = 'AAECAw==';
  const content = [
    { type: 'image', data, mimeType: 'image/png' },
    { type: 'audio', data, mimeType: 'audio/wav' },
    {
      type: 'resource',
      resource: {
        uri: 'file:///fixture.wav',
        name: 'fixture.wav',
        mimeType: 'audio/wav',
        blob: data,
      },
    },
  ];

  const transport: MCPTransport = {
    async start() {},
    async close() {
      this.onclose?.();
    },
    async send(message) {
      if ('id' in message && message.id != null) {
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: { content },
        });
      }
    },
  };

  const client = await createMCPClient({
    transport,
    initialInitializeResult: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'binary-result-example', version: '1.0.0' },
    },
  });

  try {
    const { media } = client.toolsFromDefinitions({
      tools: [
        {
          name: 'media',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });
    const output = (await media.execute({})) as CallToolResult;
    const modelOutput = await media.toModelOutput!({
      toolCallId: 'media-call',
      input: {},
      output,
    });

    assert.equal(modelOutput.type, 'content');
    assert.deepEqual(
      modelOutput.value.map(part => part.type),
      ['file', 'file', 'file'],
    );
    assert.deepEqual(
      modelOutput.value.map(part =>
        part.type === 'file' ? part.data : undefined,
      ),
      [
        { type: 'data', data },
        { type: 'data', data },
        { type: 'data', data },
      ],
    );

    print('Converted MCP tool result:', modelOutput);
  } finally {
    await client.close();
  }
});
