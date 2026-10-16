/**
 * Checks whether tool input starts with an object or array whose structure was
 * not completed. This deliberately checks structure instead of parser error
 * messages so malformed, balanced JSON remains distinguishable from truncated
 * JSON.
 */
export function isToolInputStructurallyIncomplete(input: string): boolean {
  const trimmedInput = input.trimStart();
  const firstCharacter = trimmedInput[0];

  if (firstCharacter !== '{' && firstCharacter !== '[') {
    return false;
  }

  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escaped = false;
  let complete = false;

  for (const character of trimmedInput) {
    if (complete) {
      // Non-whitespace after the completed value means the input is malformed,
      // not structurally unfinished.
      if (!/\s/.test(character)) {
        return false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '{' || character === '[') {
      stack.push(character);
    } else if (character === '}' || character === ']') {
      const expectedOpening = character === '}' ? '{' : '[';

      if (stack.at(-1) !== expectedOpening) {
        return false;
      }

      stack.pop();
      complete = stack.length === 0;
    }
  }

  return !complete;
}
