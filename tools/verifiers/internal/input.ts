import { parseArgs } from 'node:util';

export function getInputFiles() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      file: { type: 'string', multiple: true },
    },
    allowPositionals: false,
  });

  return values.file ?? [];
}
