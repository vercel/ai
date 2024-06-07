import {
  parseStateSymbol,
  Sentinel,
  type JsonArray,
  type JsonObject,
  type JsonValue,
  type PartialPrimitiveValue,
  type PartialObject,
  type PartialArray,
  type ParseEvent,
} from '../types';
import { isSpaceSeparator, isDigit, isHexDigit } from './util';

/* c8 ignore start */
const eof: unique symbol = Symbol('eof');
type EOF = typeof eof;

type TokenType =
  | 'eof'
  | 'string'
  | 'boolean'
  | 'null'
  | 'numeric'
  | 'punctuator';

type TokenValue = {
  eof: undefined;
  string: {
    whole: string;
    part: string;
  };
  boolean: boolean;
  null: null;
  punctuator: '{' | '}' | '[' | ']' | ':' | ',';
  numeric: number;
  undef: undefined;
};

type TokenBase<T extends TokenType = TokenType> = {
  type: T;
  value: TokenValue[T];
  line: number;
  column: number;
  savedParseState?: ParseState;
  savedLexState?: LexState;
};

type Token =
  | TokenBase<'eof'>
  | TokenBase<'string'>
  | TokenBase<'boolean'>
  | TokenBase<'null'>
  | TokenBase<'numeric'>
  | TokenBase<'punctuator'>;

export class ExtendedSyntaxError extends SyntaxError {
  lineNumber: number;
  columnNumber: number;

  constructor(
    message: string | undefined,
    lineNumber: number,
    columnNumber: number,
  ) {
    super(message);
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
  }
}

type ParseState =
  | 'start'
  | 'beforePropertyName'
  | 'afterPropertyName'
  | 'beforePropertyValue'
  | 'beforeArrayValue'
  | 'afterPropertyValue'
  | 'afterArrayValue'
  | 'end';

type LexState =
  | 'default'
  | 'value'
  | 'valueLiteral'
  | 'sign'
  | 'zero'
  | 'decimalInteger'
  | 'decimalPoint'
  | 'decimalFraction'
  | 'decimalExponent'
  | 'decimalExponentSign'
  | 'decimalExponentInteger'
  | 'string'
  | 'start'
  | 'stringEscape'
  | 'stringEscapeUnicode'
  | 'beforePropertyName'
  | 'afterPropertyName'
  | 'beforePropertyValue'
  | 'beforeArrayValue'
  | 'afterPropertyValue'
  | 'afterArrayValue'
  | 'end';

interface ParserOptions {
  stream?: boolean;
}

/* c8 ignore end */

export class StreamingParser<T extends JsonValue = any> {
  private source;

  private parseState: ParseState;
  private outputStack: Array<JsonArray | JsonObject>;
  private stateStack: Array<PartialArray | PartialObject>;
  private pathStack: Array<string | number>;
  private pos;
  private line;
  private column: number;
  private token!: Token;
  private key: string | undefined;
  private root: any;
  /** @internal */
  // @ts-ignore - Used for debugging.
  private stateRoot: any;
  private pushed: boolean = false;

  private parseEvents: ParseEvent<T>[];

  private stream: boolean;

  constructor({ stream = false }: ParserOptions = {}) {
    this.lexState = 'default';
    this.parseState = 'start';
    this.outputStack = [];
    this.stateStack = [];
    this.pathStack = [];
    this.pos = 0;
    this.line = 1;
    this.column = 0;
    this.key = undefined;
    this.root = undefined;
    this.stateRoot = undefined;

    // Not reset during streams:
    this.source = '';
    this.stream = stream;
    this.parseEvents = [];
  }

  public parse(text: string): T {
    return this.parseInternal(text).currentValue;
  }

  public parseIncremental(text: string) {
    let { events } = this.parseInternal(text);
    return {
      events,
    };
  }

  private parseInternal(text: string) {
    this.source += String(text);

    do {
      this.token = this.lex();
      this.parseStates(this.parseState);

      if (this.stream && this.parseState === 'end') {
        this.parseEvents.push({
          kind: 'value',
          path: [Sentinel],
          value: this.root,
        } as any);

        this.lexState = 'default';
        this.parseState = 'start';
        this.outputStack = [];
        this.stateStack = [];
        this.pathStack = [];
        this.line = 1;
        this.column = 0;
        this.key = undefined;
        this.root = undefined;
        this.stateRoot = undefined;
      }
    } while (this.token.type !== 'eof' && !this.partialLex);

    this.source = this.source.slice(this.pos);
    this.pos = 0;

    let events = this.parseEvents;
    this.parseEvents = [];

    return {
      currentValue: this.root,
      events,
    };
  }

  public parseComplete(text: string): T {
    this.endOfInput = true;
    this.source += String(text);

    do {
      this.token = this.lex();

      this.parseStates(this.parseState);
    } while (this.token.type !== 'eof');

    return this.root;
  }

  public endOfInput = false;

  public lexState: LexState;
  private buffer!: string;
  private streamBuffer!: string;

  private nextChar!: string | undefined | EOF;
  private partialLex = false;
  private unicodeEscapeBuffer!: string;
  private valueLiteralRemaining!: string;

  private lex(): Token {
    if (!this.partialLex) {
      this.lexState = 'default';
    }

    for (;;) {
      this.nextChar = this.peek();

      const token = this.lexStates(this.lexState);
      if (token) {
        return token;
      }
    }
  }

  private peek(): string | undefined | EOF {
    if (this.source[this.pos]) {
      return String.fromCodePoint(this.source.codePointAt(this.pos)!);
    }

    if (this.endOfInput) {
      return eof;
    }
  }

  private writeStringBuffer(c: string) {
    this.buffer += c;
    this.streamBuffer += c;
  }

  private read(c = this.peek()): string {
    if (c === '\n') {
      this.line++;
      this.column = 0;
    } else if (c && c !== eof) {
      this.column += c.length;
    } else {
      this.column++;
    }

    if (c && c !== eof) {
      this.pos += c.length;
    }

    return c as string;
  }

  private lexStates(state: LexState): Token | undefined {
    switch (state) {
      case 'default': {
        switch (this.nextChar) {
          case '\t':
          case '\v':
          case '\f':
          case ' ':
          case '\u00A0':
          case '\uFEFF':
          case '\n':
          case '\r':
          case '\u2028':
          case '\u2029': {
            this.read();
            return;
          }

          case undefined: {
            return this.newToken('eof', undefined, true);
          }

          case eof: {
            this.read();
            return this.newToken('eof');
          }
        }

        if (isSpaceSeparator(this.nextChar)) {
          this.read();
          return;
        }

        return this.lexStates(this.parseState);
      }

      case 'value': {
        switch (this.nextChar) {
          case '{':
          case '[': {
            return this.newToken('punctuator', this.read() as '{' | '[');
          }

          case 'n': {
            this.buffer = this.read();
            this.lexState = 'valueLiteral';
            this.valueLiteralRemaining = 'ull';
            return;
          }

          case 't': {
            this.buffer = this.read();
            this.lexState = 'valueLiteral';
            this.valueLiteralRemaining = 'rue';
            return;
          }

          case 'f': {
            this.buffer = this.read();
            this.lexState = 'valueLiteral';
            this.valueLiteralRemaining = 'alse';
            return;
          }

          case '-': {
            this.buffer = this.read();
            this.lexState = 'sign';
            return;
          }

          case '0': {
            this.buffer = this.read();
            this.lexState = 'zero';
            return;
          }

          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9': {
            this.buffer = this.read();
            this.lexState = 'decimalInteger';
            return;
          }

          case '"': {
            this.read();
            this.buffer = '';
            this.streamBuffer = '';
            this.lexState = 'string';
            return;
          }
        }

        throw this.invalidChar(this.read());
      }

      case 'valueLiteral': {
        if (this.nextChar === undefined) {
          return this.newToken('eof', undefined, true);
        }

        switch (this.nextChar) {
          case this.valueLiteralRemaining[0]: {
            this.buffer += this.read();
            this.valueLiteralRemaining = this.valueLiteralRemaining.slice(1);

            if (this.valueLiteralRemaining === '') {
              switch (this.buffer) {
                case 'null': {
                  return this.newToken('null', null);
                }

                case 'true': {
                  return this.newToken('boolean', true);
                }

                case 'false': {
                  return this.newToken('boolean', false);
                }

                // Unreachable:
                default: {
                  throw this.invalidEOF();
                }
              }
            }

            return;
          }

          case undefined: {
            return this.newToken('eof', undefined, true);
          }

          default: {
            throw this.invalidChar(this.read());
          }
        }
      }

      case 'sign': {
        switch (this.nextChar) {
          case '0': {
            this.buffer += this.read();
            this.lexState = 'zero';
            return;
          }

          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9': {
            this.buffer += this.read();
            this.lexState = 'decimalInteger';
            return;
          }

          case undefined: {
            return this.newToken('numeric', undefined, true);
          }
        }

        throw this.invalidChar(this.read());
      }

      case 'zero': {
        if (this.nextChar === undefined) {
          return this.newToken('numeric', undefined, true);
        }

        switch (this.nextChar) {
          case '.': {
            this.buffer += this.read();
            this.lexState = 'decimalPoint';
            return;
          }

          case 'e':
          case 'E': {
            this.buffer += this.read();
            this.lexState = 'decimalExponent';
            return;
          }
        }

        const token = this.newToken('numeric', Number(this.buffer));
        this.buffer = '';
        return token;
      }

      case 'decimalInteger': {
        if (this.nextChar === undefined) {
          return this.newToken('numeric', undefined, true);
        }

        switch (this.nextChar) {
          case '.': {
            this.buffer += this.read();
            this.lexState = 'decimalPoint';
            return;
          }

          case 'e':
          case 'E': {
            this.buffer += this.read();
            this.lexState = 'decimalExponent';
            return;
          }
        }

        if (isDigit(this.nextChar)) {
          this.buffer += this.read();
          return;
        }

        const token = this.newToken('numeric', Number(this.buffer));
        this.buffer = '';
        return token;
      }

      case 'decimalPoint': {
        if (this.nextChar === undefined) {
          return this.newToken('numeric', undefined, true);
        }

        switch (this.nextChar) {
          case 'e':
          case 'E': {
            this.buffer += this.read();
            this.lexState = 'decimalExponent';
            return;
          }
        }

        if (isDigit(this.nextChar)) {
          this.buffer += this.read();
          this.lexState = 'decimalFraction';
          return;
        }

        throw this.invalidChar(this.read());
      }

      case 'decimalFraction': {
        if (this.nextChar === undefined) {
          return this.newToken('numeric', undefined, true);
        }

        switch (this.nextChar) {
          case 'e':
          case 'E': {
            this.buffer += this.read();
            this.lexState = 'decimalExponent';
            return;
          }
        }

        if (isDigit(this.nextChar)) {
          this.buffer += this.read();
          return;
        }

        const token = this.newToken('numeric', Number(this.buffer));
        this.buffer = '';
        return token;
      }

      case 'decimalExponent': {
        if (this.nextChar === undefined) {
          return this.newToken('numeric', undefined, true);
        }

        switch (this.nextChar) {
          case '+':
          case '-': {
            this.buffer += this.read();
            this.lexState = 'decimalExponentSign';
            return;
          }
        }

        if (isDigit(this.nextChar)) {
          this.buffer += this.read();
          this.lexState = 'decimalExponentInteger';
          return;
        }

        throw this.invalidChar(this.read());
      }

      case 'decimalExponentSign': {
        if (this.nextChar === undefined) {
          return this.newToken('numeric', undefined, true);
        }

        if (isDigit(this.nextChar)) {
          this.buffer += this.read();
          this.lexState = 'decimalExponentInteger';
          return;
        }

        throw this.invalidChar(this.read());
      }

      case 'decimalExponentInteger': {
        if (this.nextChar === undefined) {
          return this.newToken('numeric', undefined, true);
        }

        if (isDigit(this.nextChar)) {
          this.buffer += this.read();
          return;
        }

        const token = this.newToken('numeric', Number(this.buffer));
        this.buffer = '';
        return token;
      }

      case 'string': {
        switch (this.nextChar) {
          case '\\': {
            this.read();
            this.lexState = 'stringEscape';
            return;
          }

          case '"': {
            this.read();
            const token = this.newToken('string', {
              whole: this.buffer,
              part: this.streamBuffer,
            });
            this.buffer = '';
            this.streamBuffer = '';
            return token;
          }

          case '\n':
          case '\r':
          case '\u2028':
          case '\u2029': {
            throw this.invalidChar(this.read());
          }

          case undefined: {
            const token = this.newToken(
              'string',
              {
                whole: this.buffer,
                part: this.streamBuffer,
              },
              true,
            );
            this.streamBuffer = '';
            return token;
          }

          case eof: {
            throw this.invalidChar(this.read());
          }
        }

        this.writeStringBuffer(this.read());
        break;
      }

      case 'stringEscape': {
        switch (this.nextChar) {
          case `"`:
          case '\\':
          case '/': {
            this.writeStringBuffer(this.read());
            this.lexState = 'string';
            return;
          }

          case 'b': {
            this.read();
            this.writeStringBuffer('\b');
            this.lexState = 'string';
            return;
          }

          case 'f': {
            this.read();
            this.writeStringBuffer('\f');
            this.lexState = 'string';
            return;
          }

          case 'n': {
            this.read();
            this.writeStringBuffer('\n');
            this.lexState = 'string';
            return;
          }

          case 'r': {
            this.read();
            this.writeStringBuffer('\r');
            this.lexState = 'string';
            return;
          }

          case 't': {
            this.read();
            this.writeStringBuffer('\t');
            this.lexState = 'string';
            return;
          }

          case 'u': {
            this.read();
            this.unicodeEscapeBuffer = '';
            this.lexState = 'stringEscapeUnicode';
            return;
          }

          case undefined:
            const token = this.newToken(
              'string',
              {
                whole: this.buffer,
                part: this.streamBuffer,
              },
              true,
            );
            this.streamBuffer = '';
            return token;

          default: {
            throw this.invalidChar(this.read());
          }
        }
      }

      case 'stringEscapeUnicode': {
        if (this.nextChar === undefined) {
          const token = this.newToken(
            'string',
            {
              whole: this.buffer,
              part: this.streamBuffer,
            },
            true,
          );
          this.streamBuffer = '';
          return token;
        }

        if (isHexDigit(this.nextChar)) {
          this.unicodeEscapeBuffer += this.read();

          if (this.unicodeEscapeBuffer.length === 4) {
            this.writeStringBuffer(
              String.fromCodePoint(
                Number.parseInt(this.unicodeEscapeBuffer, 16),
              ),
            );
            this.lexState = 'string';
          }

          return;
        }

        throw this.invalidChar(this.read());
      }

      case 'start': {
        switch (this.nextChar) {
          case '{':
          case '[': {
            return this.newToken('punctuator', this.read() as '{' | '[');
          }
        }

        this.lexState = 'value';
        break;
      }

      case 'beforePropertyName': {
        switch (this.nextChar) {
          case '}': {
            return this.newToken('punctuator', this.read() as '}');
          }

          case '"': {
            this.read();
            this.buffer = '';
            this.streamBuffer = '';
            this.lexState = 'string';
            return;
          }
        }

        throw this.invalidChar(this.read());
      }

      case 'afterPropertyName': {
        if (this.nextChar === ':') {
          return this.newToken('punctuator', this.read() as ':');
        }

        throw this.invalidChar(this.read());
      }

      case 'beforePropertyValue': {
        this.lexState = 'value';

        break;
      }

      case 'afterPropertyValue': {
        switch (this.nextChar) {
          case ',':
          case '}': {
            return this.newToken('punctuator', this.read() as ',' | '}');
          }
        }

        throw this.invalidChar(this.read());
      }

      case 'beforeArrayValue': {
        if (this.nextChar === ']') {
          return this.newToken('punctuator', this.read() as ']');
        }

        this.lexState = 'value';
        break;
      }

      case 'afterArrayValue': {
        switch (this.nextChar) {
          case ',':
          case ']': {
            return this.newToken('punctuator', this.read() as ',' | ']');
          }
        }

        throw this.invalidChar(this.read());
      }

      case 'end': {
        throw this.invalidChar(this.read());
      }
    }
  }

  private newToken<T extends TokenType>(
    type: T,
    value?: TokenValue[T],
    partial = false,
  ): Token {
    this.partialLex = partial;
    return {
      type,
      value,
      line: this.line,
      column: this.column,
    } as any;
  }

  private parseStates(state: ParseState) {
    switch (state) {
      case 'start': {
        if (this.token.type === 'eof') {
          if (this.endOfInput) {
            throw this.invalidEOF();
          }
          return;
        }

        this.push();
        break;
      }

      case 'beforePropertyName': {
        switch (this.token.type) {
          case 'string': {
            if (this.partialLex) {
              return;
            }

            this.key = this.token.value.whole as string;
            this.parseState = 'afterPropertyName';
            return;
          }

          case 'punctuator': {
            this.pop();
            return;
          }

          case 'eof': {
            if (this.endOfInput) {
              throw this.invalidEOF();
            }
          }
        }

        return;
      }

      case 'afterPropertyName': {
        if (this.token.type === 'eof') {
          if (this.endOfInput) {
            throw this.invalidEOF();
          }

          return;
        }

        this.parseState = 'beforePropertyValue';
        return;
      }

      case 'beforePropertyValue': {
        if (this.token.type === 'eof') {
          return;
        }

        this.push();
        return;
      }

      case 'beforeArrayValue': {
        if (this.token.type === 'eof') {
          return;
        }

        if (this.token.type === 'punctuator' && this.token.value === ']') {
          this.pop();
          return;
        }

        this.push();
        return;
      }

      case 'afterPropertyValue': {
        if (this.token.type === 'eof' && this.endOfInput) {
          throw this.invalidEOF();
        }

        switch (this.token.value) {
          case ',': {
            this.parseState = 'beforePropertyName';
            return;
          }

          case '}': {
            this.pop();
          }
        }
        return;
      }

      case 'afterArrayValue': {
        if (this.token.type === 'eof') {
          if (this.endOfInput) {
            throw this.invalidEOF();
          }

          return;
        }

        switch (this.token.value) {
          case ',': {
            this.parseState = 'beforeArrayValue';
            return;
          }

          case ']': {
            this.pop();
          }
        }
        return;
      }

      /* c8 ignore start */
      case 'end': {
        break;
      }
      /* c8 ignore stop */
    }
  }

  private partialArray(): PartialArray {
    const value = [] as any as PartialArray;
    value[parseStateSymbol] = 'partial';

    return value;
  }

  private push() {
    let value: JsonValue | undefined;
    let stateValue:
      | PartialPrimitiveValue
      | PartialObject
      | PartialArray
      | undefined;
    let path: string | number | undefined;

    switch (this.token.type) {
      case 'punctuator': {
        switch (this.token.value) {
          case '{': {
            value = {};
            stateValue = { [parseStateSymbol]: 'partial' };
            break;
          }

          case '[': {
            value = [];
            stateValue = this.partialArray();
            break;
          }
        }

        break;
      }

      case 'null':
      case 'boolean':
      case 'numeric': {
        value = this.token.value;
        stateValue = this.partialLex ? 'partial' : 'complete';
        break;
      }
      case 'string': {
        value = this.token.value.whole;
        stateValue = this.partialLex ? 'partial' : 'complete';
        break;
      }

      // This code is unreachable.
      /* c8 ignore start */
      default: {
        throw this.invalidToken();
      }
      /* c8 ignore end */
    }

    const current = this.outputStack[this.outputStack.length - 1];
    if (this.outputStack.length === 0) {
      if (this.stream && typeof value !== 'object') {
        throw new Error(
          `Unexpected input, expected object or array. Found ${this.token.type}`,
        );
      }
      this.root = value;
      this.stateRoot = stateValue;
    } else if (Array.isArray(current)) {
      const outputArray = current as JsonArray;
      const stackArray = this.stateStack[
        this.stateStack.length - 1
      ] as PartialArray;
      if (this.pushed) {
        const idx = outputArray.length - 1;
        path = idx;
        outputArray[idx] = value!;
        stackArray[idx] = stateValue!;
        if (!this.partialLex) {
          this.pushed = false;
        }
      } else {
        path = outputArray.length;
        outputArray.push(value!);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        stackArray.push(stateValue!);
        if (this.partialLex) {
          this.pushed = true;
        }
      }
    } else {
      path = this.key;
      Object.defineProperty(
        this.outputStack[this.outputStack.length - 1],
        this.key!,
        {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        },
      );
      Object.defineProperty(
        this.stateStack[this.stateStack.length - 1],
        this.key!,
        {
          value: stateValue,
          writable: true,
          enumerable: true,
          configurable: true,
        },
      );
    }

    if (value !== null && typeof value === 'object') {
      this.outputStack.push(value);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      this.stateStack.push(stateValue as any);
      this.parseState = Array.isArray(value)
        ? 'beforeArrayValue'
        : 'beforePropertyName';
      if (path !== undefined) {
        this.pathStack.push(path);
      }
    } else if (!this.partialLex) {
      const current = this.outputStack[this.outputStack.length - 1];
      // eslint-disable-next-line no-eq-null
      if (current == null) {
        this.parseState = 'end';
      } else if (Array.isArray(current)) {
        this.parseState = 'afterArrayValue';
      } else {
        this.parseState = 'afterPropertyValue';
      }
    }

    if (typeof value !== 'object') {
      let currentPath =
        path !== undefined ? [...this.pathStack, path] : [...this.pathStack];
      const parseEventKind = this.partialLex ? 'partial' : 'complete';

      if (this.token.type === 'string') {
        if (this.token.value.part) {
          this.parseEvents.push({
            kind: 'partial',
            path: [...currentPath, Sentinel],
            value: this.token.value.part,
          } as any);
        }

        if (parseEventKind === 'complete') {
          this.parseEvents.push({
            kind: 'complete',
            path: [...currentPath, Sentinel],
            value: this.token.value.whole,
          } as any);
        }
      } else {
        this.parseEvents.push({
          kind: parseEventKind,
          path: [...currentPath, Sentinel],
          value: value!,
        } as any);
      }
    }
  }

  private pop() {
    this.stateStack[this.stateStack.length - 1][parseStateSymbol] = 'complete';

    this.parseEvents.push({
      kind: 'complete',
      path: [...this.pathStack, Sentinel],
      value: this.outputStack[this.outputStack.length - 1],
    } as any);

    this.outputStack.pop();
    this.stateStack.pop();
    this.pathStack.pop();

    const current = this.outputStack[this.outputStack.length - 1];
    if (current === null || current === undefined) {
      this.parseState = 'end';
    } else if (Array.isArray(current)) {
      this.parseState = 'afterArrayValue';
    } else {
      this.parseState = 'afterPropertyValue';
    }
  }

  private invalidChar(c: string | EOF) {
    if (c === eof) {
      return this.syntaxError(
        `JSON5: invalid end of input at ${this.line}:${this.column}`,
      );
    }

    return this.syntaxError(
      `JSON5: invalid character '${this.formatChar(c)}' at ${this.line}:${
        this.column
      }`,
    );
  }

  private invalidEOF() {
    return this.syntaxError(
      `JSON5: invalid end of input at ${this.line}:${this.column}`,
    );
  }

  // This code is unreachable.
  /* c8 ignore start */
  private invalidToken() {
    if (this.token.type === 'eof') {
      return this.syntaxError(
        `JSON5: invalid end of input at ${this.line}:${this.column}`,
      );
    }

    const c = String.fromCodePoint(String(this.token.value!).codePointAt(0)!);
    return this.syntaxError(
      `JSON5: invalid character '${this.formatChar(c)}' at ${this.line}:${
        this.column
      }`,
    );
  }
  /* c8 ignore stop */

  private formatChar(c: string) {
    const replacements: Record<string, string | undefined> = {
      "'": "\\'",
      '"': '\\"',
      '\\': '\\\\',
      '\b': '\\b',
      '\f': '\\f',
      '\n': '\\n',
      '\r': '\\r',
      '\t': '\\t',
      '\v': '\\v',
      '\0': '\\0',
      '\u2028': '\\u2028',
      '\u2029': '\\u2029',
    };

    if (replacements[c]) {
      return replacements[c];
    }

    if (c < ' ') {
      // eslint-disable-next-line unicorn/prefer-code-point
      const hexString = c.charCodeAt(0).toString(16);
      return '\\x' + ('00' + hexString).slice(hexString.length);
    }

    return c;
  }

  private syntaxError(message: string | undefined) {
    const error = new ExtendedSyntaxError(message, this.line, this.column);
    return error;
  }

  /* c8 ignore start */
  /** @internal */
  getInternalState() {
    return { ...this };
  }

  /** @internal */
  // @ts-ignore - This is a private method.
  private toString() {
    return JSON.stringify(this);
  }
  /* c8 ignore end */
}
