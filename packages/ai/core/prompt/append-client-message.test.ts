import { appendClientMessage } from './append-client-message';
import { UIMessage } from '../types';

describe('appendClientMessage', () => {
  it('should append a new message to an empty array', () => {
    const message: UIMessage = {
      id: '1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    };
    const result = appendClientMessage({ messages: [], message });
    expect(result).toEqual([message]);
  });

  it('should append a new message with different id', () => {
    const existingMessage: UIMessage = {
      id: '1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    };
    const newMessage: UIMessage = {
      id: '2',
      role: 'user',
      parts: [{ type: 'text', text: 'World' }],
    };
    const result = appendClientMessage({
      messages: [existingMessage],
      message: newMessage,
    });
    expect(result).toEqual([existingMessage, newMessage]);
  });

  it('should replace last message if ids match', () => {
    const existingMessage: UIMessage = {
      id: '1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    };
    const updatedMessage: UIMessage = {
      id: '1',
      role: 'user',
      parts: [{ type: 'text', text: 'Updated' }],
    };
    const result = appendClientMessage({
      messages: [existingMessage],
      message: updatedMessage,
    });
    expect(result).toEqual([updatedMessage]);
  });
});
