import { agent } from '@/agent/fx/basic';
import { createCrashRequestHandler } from '@/lib/create-crash-request-handler';

export const POST = createCrashRequestHandler({ agent });
