import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function readLinuxSecretServicePassword({
  attributes,
}: {
  attributes: Readonly<Record<string, string>>;
}): Promise<string | undefined> {
  try {
    const result = await execFileAsync('secret-tool', [
      'lookup',
      ...Object.entries(attributes).flatMap(([attribute, value]) => [
        attribute,
        value,
      ]),
    ]);
    return result.stdout || undefined;
  } catch {
    return undefined;
  }
}
