import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { expect, it } from 'vitest';
import { z } from 'zod/v4';
import { jsonSchemaToZodObject } from './json-schema-to-zod';

it('does not advertise host-invalid tool inputs as valid to Claude', async () => {
  const events = JSON.parse(
    readFileSync(
      new URL('./__fixtures__/issue-23960-host-tools.json', import.meta.url),
      'utf8',
    ),
  ) as { type: string; input: Record<string, unknown> }[];
  const direct = JSON.parse(
    readFileSync(
      new URL('./__fixtures__/issue-23960-direct.json', import.meta.url),
      'utf8',
    ),
  ) as { content: { type: string; input: Record<string, unknown> }[] };
  const host = z.object({
    bounded: z.number().min(123).max(125),
    exclusive: z.number().gt(41).lt(43),
    text: z.string().min(7).max(9),
    items: z.array(z.string()).min(3).max(4),
    mode: z.string().default('host-default'),
  });
  const original = z.toJSONSchema(host, { io: 'input' });
  const bridge = jsonSchemaToZodObject(original);
  const server = new McpServer({ name: 'harness-tools', version: '1.0.0' });
  const client = new Client({ name: 'regression', version: '1.0.0' });
  server.registerTool('host', { inputSchema: bridge }, async () => ({
    content: [],
  }));
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    const advertised = tools[0].inputSchema;
    const validate = new AjvJsonSchemaValidator().getValidator(advertised);
    const recorded = events.find(event => event.type === 'tool-call');
    expect(recorded).toBeDefined();
    const input = recorded!.input;
    console.log('Advertised MCP schema:', JSON.stringify(advertised));

    // A fix may change the advertised schema to exclude this stale input.
    // Do not require that the broken schema continues to accept it.
    expect
      .soft(
        validate(input).valid && !host.safeParse(input).success,
        'ISSUE-23960: advertised-valid model input is rejected by host',
      )
      .toBe(false);

    const directInput = direct.content.find(
      part => part.type === 'tool_use',
    )!.input;
    expect(validate(directInput).valid).toBe(true);
    expect(host.parse(directInput).mode).toBe('host-default');

    // The bridge transports metadata; the host alone enforces these limits
    // and fills defaults. Replacing metadata with Zod checks is not a fix.
    expect(bridge.parse(input)).toEqual(input);
    expect(bridge.parse(directInput)).not.toHaveProperty('mode');
    for (const [name, keywords] of Object.entries({
      bounded: ['minimum', 'maximum'],
      exclusive: ['exclusiveMinimum', 'exclusiveMaximum'],
      text: ['minLength', 'maxLength'],
      items: ['minItems', 'maxItems'],
      mode: ['default'],
    })) {
      for (const keyword of keywords) {
        expect
          .soft(advertised.properties?.[name])
          .toHaveProperty(
            keyword,
            (original.properties![name] as Record<string, unknown>)[keyword],
          );
      }
    }
    const omitted = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        text: { type: 'string', pattern: '^x$', format: 'email' },
      },
    });
    expect(z.toJSONSchema(omitted).properties?.text).not.toHaveProperty(
      'pattern',
    );
    expect(z.toJSONSchema(omitted).properties?.text).not.toHaveProperty(
      'format',
    );
  } finally {
    await client.close();
    await server.close();
  }
});
