// @ts-nocheck
import { generateText } from 'ai';

// Callback reference
const texts = messages.map(parts => parts.map(part => part.type === 'text' ? part.text : '').join(''));

// Assigned reference
const extract = parts => parts.map(part => part.type === 'text' ? part.text : '').join('');

// Passed as an argument
register('text', parts => parts.map(part => part.type === 'text' ? part.text : '').join(''));

// Shorthand object property
const helpers = { toText: parts => parts.map(part => part.type === 'text' ? part.text : '').join('') };

// Direct call in the same file
const first = messages[0].map(part => part.type === 'text' ? part.text : '').join('');

// Unrelated member property with the same name
console.log(other.toText);
