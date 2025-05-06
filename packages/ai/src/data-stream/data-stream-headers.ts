export const dataStreamHeaders = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
  'x-vercel-ai-data-stream': 'v2',
  'x-accel-buffering': 'no', // disable nginx buffering
};
