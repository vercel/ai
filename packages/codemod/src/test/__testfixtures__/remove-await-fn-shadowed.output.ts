// @ts-nocheck
import { streamText } from 'ai';

// Parameter shadows the import: an unrelated async function
async function run(streamText) {
  const result = await streamText();
  return result.text;
}

// Local declaration shadows the import
async function local() {
  const streamText = async () => ({ text: 'local' });
  const result = await streamText();
  return result.text;
}

// Nested function inside a shadowing scope
async function outer(streamText) {
  async function inner() {
    const result = await streamText();
    return result.text;
  }
  return inner();
}

// Arrow function parameter shadows the import
const handler = async (streamText) => {
  const result = await streamText();
  return result.text;
};

// The import itself is still migrated
async function main() {
  const result = streamText({
    model: 'gpt-3.5-turbo',
    prompt: 'Hello, world!',
  });
  console.log(result);
}
