import { describe, expect, test, vi } from 'vitest';
import { createFxEngineTools } from './fx-engine-tools';

describe('createFxEngineTools', () => {
  test('lists the built-in tools the turn does not override, then the turn tools', async () => {
    const execute = vi.fn(async () => 'done');

    const tools = createFxEngineTools({
      settings: {
        skills: [],
        tools: [
          { name: 'shell', description: 'Host shell.' },
          { name: 'weather' },
        ],
      },
      execute,
    });

    expect(
      tools.map(({ name, description, idempotent, writes }) => ({
        name,
        description: description.slice(0, 30),
        idempotent,
        writes,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "description": "Read one file with bounded lin",
          "idempotent": false,
          "name": "read_file",
          "writes": true,
        },
        {
          "description": "Find file paths matching a glo",
          "idempotent": false,
          "name": "glob_files",
          "writes": true,
        },
        {
          "description": "Search text files for a litera",
          "idempotent": false,
          "name": "grep_files",
          "writes": true,
        },
        {
          "description": "Edit an existing file by repla",
          "idempotent": false,
          "name": "edit_file",
          "writes": true,
        },
        {
          "description": "Create or overwrite a file usi",
          "idempotent": false,
          "name": "write_file",
          "writes": true,
        },
        {
          "description": "Host shell.",
          "idempotent": false,
          "name": "shell",
          "writes": true,
        },
        {
          "description": "",
          "idempotent": false,
          "name": "weather",
          "writes": true,
        },
      ]
    `);
    expect(tools.at(-1)?.inputSchema).toEqual({ type: 'object' });

    await tools[0].execute({ path: 'a.txt' }, {
      executionId: 'call-1',
    } as Parameters<(typeof tools)[0]['execute']>[1]);
    await tools.at(-1)?.execute({ city: 'Paris' }, {
      executionId: 'call-2',
    } as Parameters<(typeof tools)[0]['execute']>[1]);

    expect(execute.mock.calls).toEqual([
      [
        {
          toolName: 'read_file',
          builtin: true,
          input: { path: 'a.txt' },
          executionId: 'call-1',
        },
      ],
      [
        {
          toolName: 'weather',
          builtin: false,
          input: { city: 'Paris' },
          executionId: 'call-2',
        },
      ],
    ]);
  });
});
