import type { NextRequest } from 'next/server';
import { kasadaHandler } from './kasada/kasada-server';

export async function middleware(req: NextRequest) {
  if (req.method === 'POST') {
    if (process.env.NODE_ENV === 'development') {
      return undefined;
    }
    return kasadaHandler(req);
  }
}

export const config = { matcher: ['/api/chat'] };
