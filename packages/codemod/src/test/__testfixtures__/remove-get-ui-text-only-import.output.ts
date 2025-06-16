// @ts-nocheck

function processMessage(message: any) {
  const text = message.parts.map(part => part.type === 'text' ? part.text : '').join('');
  return text;
}

const messages: any[] = [];
const result = (messages[0]?.parts || []).map(part => part.type === 'text' ? part.text : '').join(''); 