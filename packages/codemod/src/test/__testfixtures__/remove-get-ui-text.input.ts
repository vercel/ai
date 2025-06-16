// @ts-nocheck

import { getUIText, useChat } from 'ai';
import { getUIText as getText } from 'ai';

function processMessage(message: any) {
  // Basic function call
  const text = getUIText(message.parts);
  return text;
}

function processMessages(messages: any[]) {
  // Function call in map
  return messages.map(m => getUIText(m.parts));
}

// Function call with alias
function processWithAlias(message: any) {
  const result = getText(message.parts);
  return result;
}

// Function call in expression
const result = getUIText(messages[0]?.parts || []);

// Function call with variable
const parts = message.parts;
const extractedText = getUIText(parts);

// Function call in return statement
function getMessage(msg: any) {
  return getUIText(msg.parts);
} 