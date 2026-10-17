// @ts-nocheck
import { getUIText as toText, generateText } from 'ai';

// Callback reference
const texts = messages.map(toText);

// Assigned reference
const extract = toText;

// Passed as an argument
register('text', toText);

// Shorthand object property
const helpers = { toText };

// Direct call in the same file
const first = toText(messages[0]);

// Unrelated member property with the same name
console.log(other.toText);
