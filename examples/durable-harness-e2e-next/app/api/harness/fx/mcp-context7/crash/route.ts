import { agent } from '@/agent/fx/mcp-context7';
import { createCrashRequestHandler } from '@/lib/create-crash-request-handler';

export const POST = createCrashRequestHandler({ agent });
