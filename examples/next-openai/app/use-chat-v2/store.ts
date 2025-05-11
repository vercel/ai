import { ChatStore } from 'ai';

export const store = new ChatStore({
  chats: {
    '1': {
      messages: [
        {
          id: '1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello, world!' }],
        },
        {
          id: '2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hello, world!' }],
        },
      ],
    },
    '2': {
      messages: [
        {
          id: '1',
          role: 'user',
          parts: [{ type: 'text', text: 'Lucky' }],
        },
        {
          id: '2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Vicky' }],
        },
      ],
    },
    '3': {
      messages: [
        {
          id: '1',
          role: 'user',
          parts: [{ type: 'text', text: 'Cooper' }],
        },
        {
          id: '2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Louie' }],
        },
      ],
    },
  },
});
