import { detectRuntime } from './detect-runtime';
import { generateAuthToken as generateAuthTokenEdge } from './auth-edge';
import { generateAuthToken as generateAuthTokenGoogle } from './auth-google';

export async function generateAuthToken(): Promise<string> {
  switch (detectRuntime()) {
    case 'vercel-edge':
    case 'cloudflare-workers':
    case 'browser': {
      return generateAuthTokenEdge();
    }
    case 'node': {
      return generateAuthTokenGoogle();
    }
    default: {
      throw new Error('Unknown runtime');
    }
  }
}
