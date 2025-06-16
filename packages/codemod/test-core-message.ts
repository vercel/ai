import { CoreMessage, generateText } from 'ai';
const messages: CoreMessage[] = [{ role: 'user', content: 'Hello' }];
function processMessages(msgs: CoreMessage[]): number {
  return msgs.length;
}
interface CustomMessage extends CoreMessage {
  id: string;
}
type MessageList = CoreMessage[];
