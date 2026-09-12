type ArgumentStructure =
  | { kind: 'undetermined' }
  | { kind: 'other' }
  | {
      kind: 'structured';
      stack: Array<'{' | '['>;
      inString: boolean;
      escaped: boolean;
      complete: boolean;
    };

export function startsWithStructuredValue(
  value: string | null | undefined,
): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const firstCharacter = value.trimStart()[0];
  return firstCharacter === '{' || firstCharacter === '[';
}

/**
 * Incrementally tracks whether streamed tool-call arguments contain a complete
 * structured JSON value. This is intentionally structural rather than a JSON
 * parse: a currently parsable scalar can still be the prefix of a later value.
 */
export class StreamingToolCallArgumentState {
  private structure: ArgumentStructure = { kind: 'undetermined' };

  constructor(initialValue = '') {
    this.append(initialValue);
  }

  get hasCompleteStructuredValue(): boolean {
    return (
      this.structure.kind === 'structured' && this.structure.complete === true
    );
  }

  append(delta: string): void {
    let nextStructure = this.structure;

    for (const character of delta) {
      if (nextStructure.kind === 'undetermined') {
        if (/\s/.test(character)) {
          continue;
        }

        if (character !== '{' && character !== '[') {
          nextStructure = { kind: 'other' };
          continue;
        }

        nextStructure = {
          kind: 'structured',
          stack: [character],
          inString: false,
          escaped: false,
          complete: false,
        };
        continue;
      }

      if (nextStructure.kind !== 'structured' || nextStructure.complete) {
        continue;
      }

      if (nextStructure.inString) {
        if (nextStructure.escaped) {
          nextStructure.escaped = false;
        } else if (character === '\\') {
          nextStructure.escaped = true;
        } else if (character === '"') {
          nextStructure.inString = false;
        }
        continue;
      }

      if (character === '"') {
        nextStructure.inString = true;
      } else if (character === '{' || character === '[') {
        nextStructure.stack.push(character);
      } else if (character === '}' || character === ']') {
        const expectedOpening = character === '}' ? '{' : '[';
        if (nextStructure.stack.at(-1) !== expectedOpening) {
          nextStructure = { kind: 'other' };
          continue;
        }

        nextStructure.stack.pop();
        if (nextStructure.stack.length === 0) {
          nextStructure.complete = true;
        }
      }
    }

    this.structure = nextStructure;
  }
}
