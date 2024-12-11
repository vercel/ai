import { workflow } from '@ai-sdk/agent-server';
import { convertToCoreMessages, Message } from 'ai';

export default workflow({
  async start({ request }) {
    // TODO parseMessages helper
    const { messages: uiMessages } = (await request.json()) as {
      messages: Message[];
    };

    return {
      messages: convertToCoreMessages(uiMessages),
      initialTask: 'router',
    };
  },
  headers: {
    'X-Vercel-AI-Data-Stream': 'v1',

    // CORS headers for access from Next.js app
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400', // 24 hours
  },
});
