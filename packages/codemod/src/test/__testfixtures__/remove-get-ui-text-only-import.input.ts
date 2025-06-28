// @ts-nocheck

import { getUIText } from 'ai';

function processMessage(message: any) {
  const text = getUIText(message.parts);
  return text;
}

const messages: any[] = [];
const result = getUIText(messages[0]?.parts || []); 