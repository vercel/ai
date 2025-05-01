import { mcpApiHandler } from '@/util/mcp/handler';
import { createServerResponseAdapter } from '@/util/mcp/server-response';
import { NextRequest } from 'next/server';

// This route (/mcp/server) serves the MCP server; it's called by the /mcp/chat route that's used by useChat to connect to the server and fetch tools:
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
