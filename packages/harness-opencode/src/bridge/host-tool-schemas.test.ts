import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readHostToolSchemasFromEnvironment } from './host-tool-schemas';

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('host tool schemas', () => {
  it('reads schemas from a file before falling back to inline schemas', () => {
    const tempDirectory = mkdtempSync(
      path.join(tmpdir(), 'opencode-tool-schemas-'),
    );
    tempDirectories.push(tempDirectory);
    const schemasPath = path.join(tempDirectory, 'schemas.json');
    writeFileSync(
      schemasPath,
      JSON.stringify([
        {
          name: 'from-file',
          description: 'Schema stored outside the OpenCode config.',
          inputSchema: { type: 'object' },
        },
      ]),
    );

    expect(
      readHostToolSchemasFromEnvironment({
        TOOL_SCHEMAS_PATH: schemasPath,
        TOOL_SCHEMAS: JSON.stringify([{ name: 'inline' }]),
      }),
    ).toEqual([
      {
        name: 'from-file',
        description: 'Schema stored outside the OpenCode config.',
        inputSchema: { type: 'object' },
      },
    ]);
    expect(
      readHostToolSchemasFromEnvironment({
        TOOL_SCHEMAS: JSON.stringify([{ name: 'inline' }]),
      }),
    ).toEqual([{ name: 'inline' }]);
  });
});
