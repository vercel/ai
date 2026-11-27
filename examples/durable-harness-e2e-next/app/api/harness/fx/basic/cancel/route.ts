import { agent } from '@/agent/fx/basic';
import { createCancelRequestHandler } from '@/lib/create-cancel-request-handler';

export const POST = createCancelRequestHandler({ agent });
