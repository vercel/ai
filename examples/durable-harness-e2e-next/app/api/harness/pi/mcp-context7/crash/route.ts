import { agent } from '@/agent/pi/mcp-context7';
import { createCrashRequestHandler } from '@/lib/create-crash-request-handler';

export const POST = createCrashRequestHandler({ agent });
