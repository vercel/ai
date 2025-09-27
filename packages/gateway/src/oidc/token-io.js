import path from 'path';
import fs from 'fs';
import os from 'os';
import { VercelOidcTokenError } from './token-error.js';

export function findRootDir() {
  try {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      const pkgPath = path.join(dir, '.vercel');
      if (fs.existsSync(pkgPath)) {
        return dir;
      }
      dir = path.dirname(dir);
    }
  } catch (e) {
    throw new VercelOidcTokenError(
      'Token refresh only supported in node server environments',
    );
  }
  throw new VercelOidcTokenError('Unable to find root directory');
}

export function getUserDataDir() {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME;
  }
  switch (os.platform()) {
    case 'darwin':
      return path.join(os.homedir(), 'Library/Application Support');
    case 'linux':
      return path.join(os.homedir(), '.local/share');
    case 'win32':
      if (process.env.LOCALAPPDATA) {
        return process.env.LOCALAPPDATA;
      }
      return null;
    default:
      return null;
  }
}
