import { parseMessages, workflow } from '@ai-sdk/agent-server';

export default workflow({
  async start({ request }) {
    return {
      messages: await parseMessages(request),
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
