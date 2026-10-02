// @ts-nocheck
import { useChat, useCompletion } from '@ai-sdk/react';

useChat({
  api: '/api/chat',
  experimental_throttle: 100,
});

useCompletion({
  api: '/api/completion',
  experimental_throttle: 50,
});

useChat({
  api: '/api/chat',
  throttle: 100,
  experimental_throttle: 50,
});

useChat({
  id: 'chat',
  messages: [],
});
