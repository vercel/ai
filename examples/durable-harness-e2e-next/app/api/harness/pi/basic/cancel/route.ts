import { agent } from '@/agent/pi/basic';
import { createCancelRequestHandler } from '@/lib/create-cancel-request-handler';

export const POST = createCancelRequestHandler({ agent });
