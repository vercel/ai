import { agent } from '@/agent/pi/mcp-context7';
import { createCancelRequestHandler } from '@/lib/create-cancel-request-handler';

export const POST = createCancelRequestHandler({ agent });
