// @ts-nocheck

import { useChat } from 'ai';

function processMessage(message: any) {
  // Basic function call
  const text = message.parts.map(part => part.type === 'text' ? part.text : '').join('');
  return text;
}

function processMessages(messages: any[]) {
  // Function call in map
  return messages.map(m => m.parts.map(part => part.type === 'text' ? part.text : '').join(''));
}

// Function call with alias
function processWithAlias(message: any) {
  const result = message.parts.map(part => part.type === 'text' ? part.text : '').join('');
  return result;
}

// Function call in expression
const result = (messages[0]?.parts || []).map(part => part.type === 'text' ? part.text : '').join('');

// Function call with variable
const parts = message.parts;
const extractedText = parts.map(part => part.type === 'text' ? part.text : '').join('');

// Function call in return statement
function getMessage(msg: any) {
  return msg.parts.map(part => part.type === 'text' ? part.text : '').join('');
} 