// @ts-nocheck
import { generateText } from 'ai';

const text = message.parts.map(part => part.type === 'text' ? part.text : '').join('');

function render(message) {
  return message.parts.map(part => part.type === 'text' ? part.text : '').join('');
}
