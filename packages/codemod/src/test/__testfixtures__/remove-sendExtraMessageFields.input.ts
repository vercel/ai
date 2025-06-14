// @ts-nocheck

import { useChat } from '@ai-sdk/react';

// Basic case with sendExtraMessageFields: true
const { messages } = useChat({
  sendExtraMessageFields: true
});

// Case with sendExtraMessageFields: false (should still be removed)
const { messages: messages2 } = useChat({
  sendExtraMessageFields: false
});

// Case with other properties
const { messages: messages3 } = useChat({
  api: '/api/chat',
  sendExtraMessageFields: true,
  initialMessages: []
});

// Case with only sendExtraMessageFields
const { messages: messages4 } = useChat({
  sendExtraMessageFields: true,
});

// Case with sendExtraMessageFields in the middle
const { messages: messages5 } = useChat({
  api: '/api/chat',
  sendExtraMessageFields: true,
  onFinish: () => {},
});

// Case without sendExtraMessageFields (should not be changed)
const { messages: messages6 } = useChat({
  api: '/api/chat',
  initialMessages: []
});

// Case with no arguments (should not be changed)
const { messages: messages7 } = useChat();

// Case with string literal key
const { messages: messages8 } = useChat({
  'sendExtraMessageFields': true,
  api: '/api/chat'
}); 