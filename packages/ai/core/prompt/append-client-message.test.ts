import { appendClientMessage } from './append-client-message';
import { Message } from '../types';

describe('appendClientMessage', () => {
  it('should append a new message to an empty array', () => {
    const message: Message = { id: '1', role: 'user', content: 'Hello' };
    const result = appendClientMessage({ messages: [], message });
    expect(result).toEqual([message]);
  });

  it('should append a new message with different id', () => {
    const existingMessage: Message = {
      id: '1',
      role: 'user',
      content: 'Hello',
    };
    const newMessage: Message = { id: '2', role: 'user', content: 'World' };
    const result = appendClientMessage({
      messages: [existingMessage],
      message: newMessage,
    });
    expect(result).toEqual([existingMessage, newMessage]);
  });

  it('should replace last message if ids match', () => {
    const existingMessage: Message = {
      id: '1',
      role: 'user',
      content: 'Hello',
    };
    const updatedMessage: Message = {
      id: '1',
      role: 'user',
      content: 'Updated',
    };
    const result = appendClientMessage({
      messages: [existingMessage],
      message: updatedMessage,
    });
    expect(result).toEqual([updatedMessage]);
  });
});
