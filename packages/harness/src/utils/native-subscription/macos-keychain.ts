import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function readMacOSKeychainPassword({
  service,
  account,
}: {
  service: string;
  account: string;
}): Promise<string | undefined> {
  try {
    const result = await execFileAsync('/usr/bin/security', [
      'find-generic-password',
      '-s',
      service,
      '-a',
      account,
      '-w',
    ]);
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}
