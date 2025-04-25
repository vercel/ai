import { mcpApiHandler } from '@/lib/handler';
import { createServerResponseAdapter } from '@/lib/server-response';
import { NextRequest } from 'next/server';

const requestHandler = (req: NextRequest) => {
  return createServerResponseAdapter(req.signal, res => {
    mcpApiHandler(req, res);
  });
};

export {
  requestHandler as DELETE,
  requestHandler as GET,
  requestHandler as POST,
};
