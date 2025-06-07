import { defineInlineTest } from 'jscodeshift/src/testUtils';
import transform from '../codemods/rename-message-to-ui-message';

describe('rename-message-to-ui-message', () => {
  defineInlineTest(
    { default: transform, parser: 'tsx' },
    {},
    `
import { Message, CreateMessage } from 'ai';

export function handleMessage(msg: Message): CreateMessage {
  return {
    role: 'user',
    content: msg.content,
  };
}
    `,
    `
import { UIMessage, CreateUIMessage } from 'ai';

export function handleMessage(msg: UIMessage): CreateUIMessage {
  return {
    role: 'user',
    content: msg.content,
  };
}
    `,
    'should rename Message and CreateMessage imports and usage'
  );

  defineInlineTest(
    { default: transform, parser: 'tsx' },
    {},
    `
import { Message as MessageType, CreateMessage as CreateMessageType } from 'ai';

export function process(msg: MessageType): CreateMessageType {
  return msg;
}
    `,
    `
import { UIMessage as MessageType, CreateUIMessage as CreateMessageType } from 'ai';

export function process(msg: MessageType): CreateMessageType {
  return msg;
}
    `,
    'should handle aliased imports'
  );

  defineInlineTest(
    { default: transform, parser: 'tsx' },
    {},
    `
import { Message, generateText } from 'ai';

type MessageArray = Message[];

interface CustomMessage extends Message {
  id: string;
}
    `,
    `
import { UIMessage, generateText } from 'ai';

type MessageArray = UIMessage[];

interface CustomMessage extends UIMessage {
  id: string;
}
    `,
    'should handle type aliases and interface extensions'
  );

  defineInlineTest(
    { default: transform, parser: 'tsx' },
    {},
    `
import { Message } from 'other-library';
import { CreateMessage } from 'ai';

export function test(msg: Message): CreateMessage {
  return msg;
}
    `,
    `
import { Message } from 'other-library';
import { CreateUIMessage } from 'ai';

export function test(msg: Message): CreateUIMessage {
  return msg;
}
    `,
    'should only rename imports from ai package'
  );
}); 