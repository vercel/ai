import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createOpenAI } from '../openai-provider';

const provider = createOpenAI({ apiKey: 'test-api-key' });
const conversations = provider.conversations;

const server = createTestServer({
  'https://api.openai.com/v1/conversations': {},
  'https://api.openai.com/v1/conversations/conv_123': {},
  'https://api.openai.com/v1/conversations/conv_123/items': {},
  'https://api.openai.com/v1/conversations/conv_123/items/msg_456': {},
});

describe('OpenAIConversations', () => {
  describe('create', () => {
    it('should create a conversation with metadata', async () => {
      server.urls['https://api.openai.com/v1/conversations'].response = {
        type: 'json-value',
        body: {
          id: 'conv_123',
          object: 'conversation',
          created_at: 1741900000,
          metadata: { topic: 'demo' },
        },
      };

      const result = await conversations.create({
        metadata: { topic: 'demo' },
        items: [
          { type: 'message', role: 'user', content: 'Hello!' },
        ],
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "created_at": 1741900000,
          "id": "conv_123",
          "metadata": {
            "topic": "demo",
          },
          "object": "conversation",
        }
      `);
    });

    it('should create a conversation without initial items', async () => {
      server.urls['https://api.openai.com/v1/conversations'].response = {
        type: 'json-value',
        body: {
          id: 'conv_456',
          object: 'conversation',
          created_at: 1741900000,
        },
      };

      const result = await conversations.create();

      expect(result).toMatchInlineSnapshot(`
        {
          "created_at": 1741900000,
          "id": "conv_456",
          "object": "conversation",
        }
      `);
    });
  });

  describe('retrieve', () => {
    it('should retrieve a conversation', async () => {
      server.urls['https://api.openai.com/v1/conversations/conv_123'].response = {
        type: 'json-value',
        body: {
          id: 'conv_123',
          object: 'conversation',
          created_at: 1741900000,
          metadata: { topic: 'demo' },
        },
      };

      const result = await conversations.retrieve('conv_123');

      expect(result).toMatchInlineSnapshot(`
        {
          "created_at": 1741900000,
          "id": "conv_123",
          "metadata": {
            "topic": "demo",
          },
          "object": "conversation",
        }
      `);
    });
  });

  describe('update', () => {
    it('should update conversation metadata', async () => {
      server.urls['https://api.openai.com/v1/conversations/conv_123'].response = {
        type: 'json-value',
        body: {
          id: 'conv_123',
          object: 'conversation',
          created_at: 1741900000,
          metadata: { topic: 'project-x' },
        },
      };

      const result = await conversations.update('conv_123', {
        metadata: { topic: 'project-x' },
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "created_at": 1741900000,
          "id": "conv_123",
          "metadata": {
            "topic": "project-x",
          },
          "object": "conversation",
        }
      `);
    });
  });

  describe('delete', () => {
    it('should delete a conversation', async () => {
      server.urls['https://api.openai.com/v1/conversations/conv_123'].response = {
        type: 'json-value',
        body: {
          id: 'conv_123',
          object: 'conversation.deleted',
          deleted: true,
        },
      };

      const result = await conversations.delete('conv_123');

      expect(result).toMatchInlineSnapshot(`
        {
          "deleted": true,
          "id": "conv_123",
          "object": "conversation.deleted",
        }
      `);
    });
  });

  describe('items', () => {
    describe('list', () => {
      it('should list conversation items', async () => {
        server.urls['https://api.openai.com/v1/conversations/conv_123/items'].response = {
          type: 'json-value',
          body: {
            object: 'list',
            data: [
              {
                type: 'message',
                id: 'msg_abc',
                status: 'completed',
                role: 'user',
                content: 'Hello!',
              },
            ],
            first_id: 'msg_abc',
            last_id: 'msg_abc',
            has_more: false,
          },
        };

        const result = await conversations.items.list('conv_123', { limit: 10 });

        expect(result).toMatchInlineSnapshot(`
          {
            "data": [
              {
                "content": "Hello!",
                "id": "msg_abc",
                "role": "user",
                "status": "completed",
                "type": "message",
              },
            ],
            "first_id": "msg_abc",
            "has_more": false,
            "last_id": "msg_abc",
            "object": "list",
          }
        `);
      });
    });

    describe('create', () => {
      it('should create conversation items', async () => {
        server.urls['https://api.openai.com/v1/conversations/conv_123/items'].response = {
          type: 'json-value',
          body: {
            object: 'list',
            data: [
              {
                type: 'message',
                id: 'msg_abc',
                status: 'completed',
                role: 'user',
                content: 'Hello!',
              },
              {
                type: 'message',
                id: 'msg_def',
                status: 'completed',
                role: 'user',
                content: 'How are you?',
              },
            ],
            first_id: 'msg_abc',
            last_id: 'msg_def',
            has_more: false,
          },
        };

        const result = await conversations.items.create('conv_123', {
          items: [
            {
              type: 'message',
              role: 'user',
              content: 'Hello!',
            },
            {
              type: 'message',
              role: 'user',
              content: 'How are you?',
            },
          ],
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "data": [
              {
                "content": "Hello!",
                "id": "msg_abc",
                "role": "user",
                "status": "completed",
                "type": "message",
              },
              {
                "content": "How are you?",
                "id": "msg_def",
                "role": "user",
                "status": "completed",
                "type": "message",
              },
            ],
            "first_id": "msg_abc",
            "has_more": false,
            "last_id": "msg_def",
            "object": "list",
          }
        `);
      });
    });

    describe('retrieve', () => {
      it('should retrieve a conversation item', async () => {
        server.urls['https://api.openai.com/v1/conversations/conv_123/items/msg_456'].response = {
          type: 'json-value',
          body: {
            type: 'message',
            id: 'msg_abc',
            status: 'completed',
            role: 'user',
            content: 'Hello!',
          },
        };

        const result = await conversations.items.retrieve('conv_123', 'msg_456');

        expect(result).toMatchInlineSnapshot(`
          {
            "content": "Hello!",
            "id": "msg_abc",
            "role": "user",
            "status": "completed",
            "type": "message",
          }
        `);
      });
    });

    describe('delete', () => {
      it('should delete a conversation item', async () => {
        server.urls['https://api.openai.com/v1/conversations/conv_123/items/msg_456'].response = {
          type: 'json-value',
          body: {
            id: 'conv_123',
            object: 'conversation',
            created_at: 1741900000,
            metadata: { topic: 'demo' },
          },
        };

        const result = await conversations.items.delete('conv_123', 'msg_456');

        expect(result).toMatchInlineSnapshot(`
          {
            "created_at": 1741900000,
            "id": "conv_123",
            "metadata": {
              "topic": "demo",
            },
            "object": "conversation",
          }
        `);
      });
    });
  });
});