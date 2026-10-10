import { createMCPClient } from '@ai-sdk/mcp';
import type { JSONSchema7 } from '@ai-sdk/provider';
import { asSchema } from '@ai-sdk/provider-utils';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const failureSignal =
  'ISSUE_22636: automatic MCP tools reject valid dictionary inputs';

async function main() {
  // Resolve the existing Ajv 8 dependency from a workspace package that
  // declares it, without adding reproduction-only package dependencies.
  const ajvPath = createRequire(
    import.meta.resolve('@ai-sdk/workflow/package.json'),
  ).resolve('ajv');
  const { default: Ajv } = (await import(pathToFileURL(ajvPath).href)) as {
    default: new () => {
      validate(schema: JSONSchema7, value: unknown): boolean;
    };
  };
  const ajv = new Ajv();

  const client = await createMCPClient({
    transport: {
      async start() {},
      async close() {},
      async send() {},
    },
    initialInitializeResult: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'mock', version: '1' },
    },
  });

  try {
    const dictionarySchema = {
      type: 'object',
      properties: {},
      additionalProperties: { type: 'string' },
    } satisfies JSONSchema7;
    const input = { language: 'en', project: 'example' };
    const tools = client.toolsFromDefinitions({
      tools: [
        {
          name: 'labels',
          inputSchema: dictionarySchema,
        },
        {
          name: 'unrestrictedLabels',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: true,
          },
        },
        {
          name: 'closedLabels',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: 'noArguments',
          inputSchema: { type: 'object' },
        },
      ],
    });
    const convertedDictionarySchema = await asSchema(tools.labels.inputSchema)
      .jsonSchema;
    const convertedUnrestrictedSchema = await asSchema(
      tools.unrestrictedLabels.inputSchema,
    ).jsonSchema;
    const convertedClosedSchema = await asSchema(tools.closedLabels.inputSchema)
      .jsonSchema;
    const convertedNoArgumentsSchema = await asSchema(
      tools.noArguments.inputSchema,
    ).jsonSchema;

    assert.equal(
      ajv.validate(dictionarySchema, input),
      true,
      'Reproduction setup must use an input accepted by the MCP server schema',
    );
    assert.equal(
      ajv.validate(convertedClosedSchema, input),
      false,
      'Explicit additionalProperties: false must continue rejecting extra keys',
    );
    assert.deepEqual(
      convertedNoArgumentsSchema,
      {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      'Zero-argument normalization must remain intact',
    );

    const failures = [
      !ajv.validate(convertedDictionarySchema, input)
        ? 'schema-valued additionalProperties was overwritten'
        : undefined,
      !ajv.validate(convertedUnrestrictedSchema, input)
        ? 'additionalProperties: true was overwritten'
        : undefined,
    ].filter((failure): failure is string => failure != null);

    if (failures.length > 0) {
      console.error(failureSignal);
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      console.error(JSON.stringify(convertedDictionarySchema));
      process.exitCode = 1;
      return;
    }

    console.log('Issue #22636 did not reproduce.');
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
