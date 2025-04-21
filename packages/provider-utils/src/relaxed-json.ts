// Custom 'some' function definition (slightly different from ES5, returns the truthy value directly)
// :: array -> fn -> *
function some<T, R>(
  array: T[],
  f: (item: T, index: number, arr: T[]) => R | undefined | false,
): R | false {
  let acc: R | false = false;
  for (let i = 0; i < array.length; i++) {
    // We assume R is a truthy type if the condition is met, or undefined/false otherwise.
    const result = f(array[i], i, array);
    acc = result === undefined ? false : result;
    if (acc) {
      return acc; // Return the actual truthy value found
    }
  }
  return acc; // Returns false if no truthy value was returned by f
}

// --- Type Definitions ---

// Type for the specification of a single token type
type TokenSpec = {
  re: RegExp;
  // Function to process the regex match and return a RawToken
  f: (match: RegExpExecArray) => RawToken;
};

// Literal types for possible token types
type TokenType =
  | 'atom' // null, true, false
  | 'number'
  | 'string'
  | '['
  | ']'
  | '{'
  | '}'
  | ':'
  | ','
  | ' ' // Whitespace / Comments
  | 'eof'; // End of file

// Type for a token right after regex matching, before line number is added
// Value is optional as punctuation/whitespace tokens might not have a semantic value
type RawToken = {
  type: TokenType;
  match: string; // The raw matched text
  value?: any; // The parsed value (for strings, numbers, atoms)
};

// Type for a token including line number information
type Token = RawToken & {
  line: number;
};

// Type for parse warnings
type ParseWarning = {
  message: string;
  line: number;
};

// Type for the state object used during parsing
type ParseState = {
  pos: number; // Current position in the token array
  warnings: ParseWarning[];
  // Options passed to the parser
  tolerant: boolean;
  duplicate: boolean; // Whether to check for duplicate keys
  reviver?: (key: string, value: any) => any; // Optional JSON reviver function
};

// Type for options passed to the main parse function
type ParseOptions = {
  relaxed?: boolean; // Use relaxed lexing rules? (default: true)
  warnings?: boolean; // Collect warnings? (implies tolerant, default: false)
  tolerant?: boolean; // Tolerate errors and try to continue? (default: false)
  duplicate?: boolean; // Allow duplicate keys? (default: false)
  reviver?: (key: string, value: any) => any; // JSON reviver function
};

// Type for options specific to the parseMany function
type ParseManyOpts<T> = {
  skip: TokenType[]; // Token types to skip initially
  elementParser: (tokens: Token[], state: ParseState, obj: T) => void; // Function to parse an element/pair
  elementName: string; // Name of the expected element for error messages
  endSymbol: TokenType; // The token type that marks the end of the structure (']' or '}')
};

// --- Lexer Implementation ---

// Factory function to create a lexer
// :: array tokenSpec -> fn
function makeLexer(tokenSpecs: TokenSpec[]): (contents: string) => Token[] {
  // The returned lexer function
  // :: string -> array token
  return function (contents: string): Token[] {
    const tokens: Token[] = [];
    let line = 1; // Start at line 1

    // Helper function to find the next token in the input string
    // :: -> { raw: string, matched: RawToken } | undefined
    function findToken(): { raw: string; matched: RawToken } | undefined {
      // Use the custom 'some' function to iterate through token specifications
      const result = some(tokenSpecs, tokenSpec => {
        const m = tokenSpec.re.exec(contents); // Try to match the regex at the current position
        if (m) {
          const raw = m[0]; // The matched raw string
          contents = contents.slice(raw.length); // Consume the matched part from the input
          return {
            raw: raw,
            matched: tokenSpec.f(m), // Process the match using the spec's function
          };
        } else {
          return undefined; // No match for this spec
        }
      });
      return result === false ? undefined : result;
    }

    // Main lexing loop
    while (contents !== '') {
      const matched = findToken(); // Find the next token

      if (!matched) {
        // If no token spec matches, it's a syntax error
        const err = new SyntaxError(
          `Unexpected character: ${contents[0]}; input: ${contents.substr(
            0,
            100,
          )}`,
        );
        // Attach line number to the error object (standard Error doesn't have it by default)
        (err as any).line = line;
        throw err;
      }

      // Add line number information to the matched token
      // We need type assertion because 'matched.matched' is initially RawToken
      const tokenWithLine = matched.matched as Token;
      tokenWithLine.line = line;

      // Update line number count based on newlines in the matched raw string
      line += matched.raw.replace(/[^\n]/g, '').length;

      tokens.push(tokenWithLine); // Add the finalized token to the list
    }

    // Add an EOF token (useful for the parser) - Optional, depends on parser needs.
    // The current parser handles end-of-input via state.pos check, so EOF token isn't strictly needed here
    // tokens.push({ type: 'eof', match: '', value: undefined, line: line });

    return tokens;
  };
}

// --- Token Creation Helper Functions ---

// :: tuple string string -> rawToken
function fStringSingle(m: RegExpExecArray): RawToken {
  // Handles strings in single quotes, converting them to standard JSON double-quoted strings
  const content = m[1].replace(
    /([^'\\]|\\['bnrtf\\]|\\u[0-9a-fA-F]{4})/g,
    mm => {
      if (mm === '"') {
        return '\\"'; // Escape double quotes inside
      } else if (mm === "\\'") {
        return "'"; // Unescape escaped single quotes
      } else {
        return mm;
      }
    },
  );

  const match = `"${content}"`;
  return {
    type: 'string',
    match: match, // The transformed, double-quoted string representation
    // Use JSON.parse on the transformed string to handle escape sequences correctly
    value: JSON.parse(match),
  };
}

// :: tuple string -> rawToken
function fStringDouble(m: RegExpExecArray): RawToken {
  // Handles standard JSON double-quoted strings
  return {
    type: 'string',
    match: m[0], // The raw matched string (including quotes)
    value: JSON.parse(m[0]), // Use JSON.parse to handle escapes and get the value
  };
}

// :: tuple string -> rawToken
function fIdentifier(m: RegExpExecArray): RawToken {
  // Transforms unquoted identifiers into JSON strings
  const value = m[0];
  const match =
    '"' +
    value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + // Escape backslashes and quotes
    '"';
  return {
    type: 'string', // Treat identifiers as strings
    value: value, // The original identifier name
    match: match, // The double-quoted string representation
  };
}

// :: tuple string -> rawToken
function fComment(m: RegExpExecArray): RawToken {
  // Treats comments as whitespace, preserving only newlines
  const match = m[0].replace(/./g, c => (/\s/.test(c) ? c : ' '));
  return {
    type: ' ', // Represent comments as whitespace tokens
    match: match, // String containing original newlines and spaces for other chars
    value: undefined, // Comments don't have a semantic value
  };
}

// :: tuple string -> rawToken
function fNumber(m: RegExpExecArray): RawToken {
  // Handles numbers (integers, floats, exponents)
  return {
    type: 'number',
    match: m[0], // The raw matched number string
    value: parseFloat(m[0]), // Convert string to number
  };
}

// :: tuple ("null" | "true" | "false") -> rawToken
function fKeyword(m: RegExpExecArray): RawToken {
  // Handles JSON keywords: null, true, false
  let value: null | boolean;
  switch (m[0]) {
    case 'null':
      value = null;
      break;
    case 'true':
      value = true;
      break;
    case 'false':
      value = false;
      break;
    default:
      // Should be unreachable due to regex, but satisfies TypeScript exhaustiveness check
      throw new Error(`Unexpected keyword: ${m[0]}`);
  }
  return {
    type: 'atom', // Use 'atom' type for these literals
    match: m[0], // The raw matched keyword
    value: value, // The corresponding JavaScript value
  };
}

// --- Token Specification Creation ---

// :: boolean -> array tokenSpec
function makeTokenSpecs(relaxed: boolean): TokenSpec[] {
  // Helper to create a simple token spec function
  // :: string -> fn
  function f(type: TokenType): (m: RegExpExecArray) => RawToken {
    // :: tuple string -> rawToken
    return function (m: RegExpExecArray): RawToken {
      // For simple tokens like punctuation, value is not needed
      return { type: type, match: m[0], value: undefined };
    };
  }

  // Base JSON token specifications (strict)
  let tokenSpecs: TokenSpec[] = [
    { re: /^\s+/, f: f(' ') }, // Whitespace
    { re: /^\{/, f: f('{') }, // Object start
    { re: /^\}/, f: f('}') }, // Object end
    { re: /^\[/, f: f('[') }, // Array start
    { re: /^\]/, f: f(']') }, // Array end
    { re: /^,/, f: f(',') }, // Comma separator
    { re: /^:/, f: f(':') }, // Key-value separator
    { re: /^(?:true|false|null)/, f: fKeyword }, // Keywords
    // Number: optional sign, digits, optional decimal part, optional exponent
    { re: /^\-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, f: fNumber },
    // String: double-quoted, handles escapes
    { re: /^"(?:[^"\\]|\\["bnrtf\\\/]|\\u[0-9a-fA-F]{4})*"/, f: fStringDouble },
  ];

  // Add relaxed syntax rules if requested
  if (relaxed) {
    tokenSpecs = tokenSpecs.concat([
      // Single-quoted strings
      {
        re: /^'((?:[^'\\]|\\['bnrtf\\\/]|\\u[0-9a-fA-F]{4})*)'/,
        f: fStringSingle,
      },
      // Single-line comments (// ...)
      { re: /^\/\/.*?(?:\r\n|\r|\n)/, f: fComment },
      // Multi-line comments (/* ... */)
      { re: /^\/\*[\s\S]*?\*\//, f: fComment },
      // Unquoted identifiers (treated as strings)
      // Allows letters, numbers, _, -, +, ., *, ?, !, |, &, %, ^, /, #, \
      { re: /^[$a-zA-Z0-9_\-+\.\*\?!\|&%\^\/#\\]+/, f: fIdentifier },
      // Note: The order matters here. Identifiers are checked after keywords/numbers.
    ]);
  }

  return tokenSpecs;
}

// Create lexer instances
const lexer = makeLexer(makeTokenSpecs(true)); // Relaxed syntax lexer
const strictLexer = makeLexer(makeTokenSpecs(false)); // Strict JSON lexer

// --- Parser Helper Functions ---

// Find the index of the previous non-whitespace token
// :: array token -> nat -> nat?
function previousNWSToken(tokens: Token[], index: number): number | undefined {
  for (; index >= 0; index--) {
    if (tokens[index].type !== ' ') {
      return index; // Return index of the non-whitespace token
    }
  }
  return undefined; // Not found
}

// Removes trailing commas from arrays and objects in a token stream
// :: array token -> array token
function stripTrailingComma(tokens: Token[]): Token[] {
  const res: Token[] = [];

  tokens.forEach((token, index) => {
    // Check if the current token is a closing bracket or brace
    if (index > 0 && (token.type === ']' || token.type === '}')) {
      // Find the last non-whitespace token *before* this closing token in the result array 'res'
      const prevNWSTokenIndex = previousNWSToken(res, res.length - 1); // Look in `res`, not `tokens`!

      // Check if it's a comma
      if (
        prevNWSTokenIndex !== undefined &&
        res[prevNWSTokenIndex].type === ','
      ) {
        // Find the token *before* the comma
        const preCommaIndex = previousNWSToken(res, prevNWSTokenIndex - 1);

        // Ensure there *was* a token before the comma, and it wasn't an opening bracket/brace
        // This prevents removing the comma in `[,1]` or `{, "a":1}` which is invalid anyway
        if (
          preCommaIndex !== undefined &&
          res[preCommaIndex].type !== '[' &&
          res[preCommaIndex].type !== '{'
        ) {
          // Replace the trailing comma with a whitespace token
          res[prevNWSTokenIndex] = {
            type: ' ',
            match: ' ', // Represent as a single space
            value: undefined, // Whitespace has no value
            line: res[prevNWSTokenIndex].line, // Preserve original line number
          };
        }
      }
    }

    res.push(token); // Add the current token (or the original closing bracket/brace)
  });

  return res;
}

// Transforms raw text into a string closer to standard JSON by lexing and re-joining matches.
// Primarily used when `warnings: false` but `relaxed: true`.
// :: string -> string
function transform(text: string): string {
  // Tokenize contents using the relaxed lexer
  let tokens = lexer(text);

  // Remove trailing commas if present
  tokens = stripTrailingComma(tokens);

  // Concatenate the 'match' part of each token back into a single string
  return tokens.reduce((str, token) => {
    return str + token.match;
  }, '');
}

// --- Parsing Core Functions ---

// Get the next token from the stream and advance the position
// :: array parseToken -> parseState -> *
function popToken(tokens: Token[], state: ParseState): Token {
  const token = tokens[state.pos];
  state.pos += 1;

  if (!token) {
    // If we are past the end of the token array, return an EOF token
    const lastLine = tokens.length !== 0 ? tokens[tokens.length - 1].line : 1;
    return { type: 'eof', match: '', value: undefined, line: lastLine };
  }

  return token;
}

// Get a string representation of a token for error messages
// :: token -> string
function strToken(token: Token): string {
  switch (token.type) {
    case 'atom':
    case 'string':
    case 'number':
      // Show type and the matched text (or value, match is usually better for context)
      return `${token.type} ${token.match}`;
    case 'eof':
      return 'end-of-file';
    default:
      // For punctuation, just show the symbol itself in quotes
      return `'${token.type}'`;
  }
}

// Expects and consumes a colon token, raises error/warning otherwise
// :: array token -> parseState -> undefined
function skipColon(tokens: Token[], state: ParseState): void {
  const colon = popToken(tokens, state);
  if (colon.type !== ':') {
    const message = `Unexpected token: ${strToken(colon)}, expected ':'`;
    if (state.tolerant) {
      state.warnings.push({
        message: message,
        line: colon.line,
      });
      // If tolerant, put the unexpected token back by decrementing pos
      // This allows the parser to potentially recover
      state.pos -= 1;
    } else {
      const err = new SyntaxError(message);
      (err as any).line = colon.line;
      throw err;
    }
  }
}

// Skips over any punctuation tokens until a valid data token or EOF is found.
// Used to recover in tolerant mode or find the start of the next value.
// :: array token -> parseState -> (array string)? -> token
function skipPunctuation(
  tokens: Token[],
  state: ParseState,
  valid?: TokenType[],
): Token {
  // Define common punctuation tokens that might appear unexpectedly
  const punctuation: TokenType[] = [',', ':', ']', '}'];
  let token = popToken(tokens, state);

  while (true) {
    // eslint-disable-line no-constant-condition
    // If the token is one of the valid types we're looking for, return it
    if (valid && valid.includes(token.type)) {
      return token;
    } else if (token.type === 'eof') {
      // If we hit EOF, return it
      return token;
    } else if (punctuation.includes(token.type)) {
      // If it's unexpected punctuation...
      const message = `Unexpected token: ${strToken(
        token,
      )}, expected '[', '{', number, string or atom`;
      if (state.tolerant) {
        // In tolerant mode, record a warning and get the next token
        state.warnings.push({
          message: message,
          line: token.line,
        });
        token = popToken(tokens, state); // Continue skipping
      } else {
        // In strict mode, throw an error
        const err = new SyntaxError(message);
        (err as any).line = token.line;
        throw err;
      }
    } else {
      // If it's not punctuation, EOF, or a specifically valid token,
      // it must be the start of a value/object/array, so return it.
      return token;
    }
  }
}

// Helper to raise an error or add a warning based on tolerant mode
// :: parseState -> token -> string -> undefined
function raiseError(state: ParseState, token: Token, message: string): void {
  if (state.tolerant) {
    state.warnings.push({
      message: message,
      line: token.line,
    });
  } else {
    const err = new SyntaxError(message);
    (err as any).line = token.line;
    throw err;
  }
}

// Helper for common "Unexpected token X, expected Y" errors
// :: parseState -> token -> string -> undefined
function raiseUnexpected(
  state: ParseState,
  token: Token,
  expected: string,
): void {
  raiseError(
    state,
    token,
    `Unexpected token: ${strToken(token)}, expected ${expected}`,
  );
}

// Checks for duplicate keys in an object if state.duplicate is false
// :: parseState -> {} -> parseToken -> undefined
function checkDuplicates(
  state: ParseState,
  obj: { [key: string]: any },
  token: Token,
): void {
  // We assume token.type is 'string' here based on where it's called in parsePair
  // If other types could be keys, this check needs adjustment.
  const key = String(token.value); // Ensure key is string for lookup

  // Only check if the duplicate checking is enabled
  if (!state.duplicate && Object.prototype.hasOwnProperty.call(obj, key)) {
    raiseError(state, token, `Duplicate key: ${key}`);
    // Note: In tolerant mode, this only adds a warning; the duplicate value will overwrite
  }
}

// Appends a key-value pair to an object, applying the reviver function if present
// :: parseState -> any -> any -> any -> undefined
function appendPair(
  state: ParseState,
  obj: { [key: string]: any },
  key: string,
  value: any,
): void {
  // Apply reviver function if it exists
  const finalValue = state.reviver ? state.reviver(key, value) : value;
  // The reviver can return undefined to omit the key/value pair
  if (finalValue !== undefined) {
    obj[key] = finalValue;
  }
}

// Parses a key-value pair within an object
// :: array parseToken -> parseState -> map -> undefined
function parsePair(
  tokens: Token[],
  state: ParseState,
  obj: { [key: string]: any },
): void {
  // Skip leading punctuation, expecting a string key (or ':' in tolerant mode)
  let token = skipPunctuation(tokens, state, [':', 'string', 'number', 'atom']); // Allow recovery
  let key: string;
  let value: any;

  // --- Key Parsing ---
  if (token.type !== 'string') {
    // Handle unexpected token where a string key was expected
    raiseUnexpected(state, token, 'string key');

    // Attempt recovery in tolerant mode
    if (state.tolerant) {
      switch (token.type) {
        case ':': // If colon found directly, assume missing key, use "null"
          token = {
            type: 'string',
            value: 'null',
            match: '"null"',
            line: token.line,
          };
          state.pos -= 1; // Put the colon back for skipColon
          break;
        case 'number': // Use number as string key
        case 'atom': // Use atom value as string key
          token = {
            type: 'string',
            value: String(token.value),
            match: `"${token.value}"`,
            line: token.line,
          };
          break;
        case '[': // Assume missing key before an array
        case '{': // Assume missing key before an object
          state.pos -= 1; // Put back the bracket/brace
          value = parseAny(tokens, state); // Parse the value directly
          checkDuplicates(state, obj, {
            type: 'string',
            value: 'null',
            match: '"null"',
            line: token.line,
          }); // Check duplicate for "null" key
          appendPair(state, obj, 'null', value); // Append with "null" key
          return; // Finished parsing this "pair"
        case 'eof': // Reached end unexpectedly
          return; // Cannot recover
        default: // Other unexpected token (like comma, closing brace)
          // raiseUnexpected already issued a warning/error. Try to advance.
          // This might lead to cascading errors, but it's tolerant mode.
          return;
      }
    } else {
      // In non-tolerant mode, raiseUnexpected already threw.
      return; // Should be unreachable
    }
  }

  // Now we have a string token (potentially recovered)
  checkDuplicates(state, obj, token);
  key = String(token.value); // Ensure key is string

  // --- Colon and Value Parsing ---
  skipColon(tokens, state); // Expect and consume ':'
  value = parseAny(tokens, state); // Parse the value recursively

  // --- Appending Pair ---
  appendPair(state, obj, key, value);
}

// Parses an element within an array
// :: array parseToken -> parseState -> array -> undefined
function parseElement(tokens: Token[], state: ParseState, arr: any[]): void {
  const key = arr.length; // Key is the current array index
  // Skip potential leading punctuation (like extra commas in tolerant mode)
  // skipPunctuation used inside parseAny handles this implicitly
  const value = parseAny(tokens, state); // Recursively parse the element value
  // Apply reviver using the index as a string key
  arr[key] = state.reviver ? state.reviver(String(key), value) : value;
}

// Parses a JSON object structure: '{' key:value, ... '}'
// :: array parseToken -> parseState -> {}
function parseObject(
  tokens: Token[],
  state: ParseState,
): { [key: string]: any } {
  const obj = {};
  // Call parseMany to handle the structure { pair1, pair2, ... }
  return parseMany<{ [key: string]: any }>(tokens, state, obj, {
    skip: [':', '}'], // Initially skip over colon or closing brace (for empty/tolerant cases)
    elementParser: parsePair, // Use parsePair to parse each key-value element
    elementName: 'string key', // Expected element type for errors
    endSymbol: '}', // The closing token for an object
  });
}

// Parses a JSON array structure: '[' element, ... ']'
// :: array parseToken -> parseState -> array
function parseArray(tokens: Token[], state: ParseState): any[] {
  const arr: any[] = [];
  // Call parseMany to handle the structure [ element1, element2, ... ]
  return parseMany<any[]>(tokens, state, arr, {
    skip: [']'], // Initially skip over closing bracket (for empty/tolerant cases)
    elementParser: parseElement, // Use parseElement to parse each array item
    elementName: 'json value', // Expected element type for errors
    endSymbol: ']', // The closing token for an array
  });
}

// Generic function to parse comma-separated elements within enclosing symbols (like objects or arrays)
// :: t : array | {} => array parseToken -> parseState -> t -> parseManyOpts -> t
function parseMany<T>(
  tokens: Token[],
  state: ParseState,
  result: T,
  opts: ParseManyOpts<T>,
): T {
  // Get the first token, skipping over potential initial punctuation (defined in opts.skip)
  let token = skipPunctuation(tokens, state, opts.skip);

  // Handle empty structure or unexpected EOF
  if (token.type === 'eof') {
    raiseUnexpected(state, token, `'${opts.endSymbol}' or ${opts.elementName}`);
    // Attempt recovery in tolerant mode by assuming structure was closed
    if (state.tolerant) {
      return result;
    } else {
      // Error already thrown by raiseUnexpected
      return result; // Should be unreachable
    }
  }

  // Check if it's immediately the end symbol (e.g., empty array/object)
  if (token.type === opts.endSymbol) {
    return result;
  }

  // --- Parse First Element ---
  // If it wasn't the end symbol, it should be the start of the first element.
  // Put the token back so the element parser can consume it.
  state.pos -= 1;
  opts.elementParser(tokens, state, result);

  // --- Parse Remaining Elements ---
  while (true) {
    // eslint-disable-line no-constant-condition
    // After an element, expect a comma or the end symbol
    token = popToken(tokens, state);

    // Validate the token
    if (token.type !== opts.endSymbol && token.type !== ',') {
      raiseUnexpected(state, token, `',' or '${opts.endSymbol}'`);

      // Attempt recovery in tolerant mode
      if (state.tolerant) {
        // If it was EOF, assume the structure was implicitly closed
        if (token.type === 'eof') {
          return result;
        }
        // Otherwise, assume a comma was missing and put the token back
        // to be parsed as the start of the next element.
        state.pos -= 1;
        // Continue to the element parsing step below (simulates a comma)
      } else {
        // Error already thrown by raiseUnexpected
        return result; // Should be unreachable
      }
    }

    // Handle based on token type
    switch (token.type) {
      case opts.endSymbol:
        // End of the structure found
        return result;

      case ',':
        // Comma found, parse the next element
        // Check for trailing comma before end symbol in tolerant mode
        const nextToken = tokens[state.pos]; // Peek ahead
        if (state.tolerant && nextToken && nextToken.type === opts.endSymbol) {
          // If the next token is the end symbol, treat this as a trailing comma
          raiseError(state, token, `Trailing comma before '${opts.endSymbol}'`);
          // Consume the end symbol and return
          popToken(tokens, state); // Consume the end symbol
          return result;
        }
        // Otherwise, parse the element following the comma
        opts.elementParser(tokens, state, result);
        break;
      // Default case is only reachable in tolerant mode recovery above
      default:
        opts.elementParser(tokens, state, result);
        break;
    }
  }
}

// Perform final checks after parsing the main value
// :: array parseToken -> parseState -> any -> undefined
function endChecks(tokens: Token[], state: ParseState, ret: any): void {
  // Check if there are unparsed tokens remaining
  if (state.pos < tokens.length) {
    // In tolerant mode, skip trailing whitespace/punctuation before declaring error
    if (state.tolerant) {
      skipPunctuation(tokens, state); // Try skipping junk
    }
    // If still not at the end, raise error/warning
    if (state.pos < tokens.length) {
      raiseError(
        state,
        tokens[state.pos],
        `Unexpected token: ${strToken(tokens[state.pos])}, expected end-of-input`,
      );
    }
  }

  // If in tolerant mode and warnings were generated, throw a summary error at the end
  if (state.tolerant && state.warnings.length > 0) {
    const message =
      state.warnings.length === 1
        ? state.warnings[0].message // Single warning message
        : `${state.warnings.length} parse warnings`; // Multiple warnings summary
    const err = new SyntaxError(message);
    // Attach details to the error object
    (err as any).line = state.warnings[0].line; // Line of the first warning
    (err as any).warnings = state.warnings; // Array of all warnings
    (err as any).obj = ret; // The partially parsed object (might be useful)
    throw err;
  }
}

// Main recursive parsing function for any JSON value type
// :: array parseToken -> parseState -> boolean? -> any
function parseAny(
  tokens: Token[],
  state: ParseState,
  end: boolean = false,
): any {
  // Skip any leading punctuation (useful for recovery in tolerant mode)
  const token = skipPunctuation(tokens, state);
  let ret: any; // Variable to hold the parsed result

  // Check for premature end of file
  if (token.type === 'eof') {
    // Only raise error if we expected a value (not called recursively within a structure)
    // If 'end' is true, we are at the top level.
    if (end) {
      raiseUnexpected(state, token, 'json value');
    }
    // If called recursively (e.g., after a comma), returning undefined might be handled
    // by the caller (like parseElement/parsePair). However, hitting EOF here usually
    // means an incomplete structure. Let's raise an error/warning.
    raiseUnexpected(state, token, 'json value');
    return undefined; // Return undefined in tolerant mode after warning
  }

  // Parse based on the token type
  switch (token.type) {
    case '{': // Start of an object
      ret = parseObject(tokens, state);
      break;
    case '[': // Start of an array
      ret = parseArray(tokens, state);
      break;
    case 'string': // String literal
    case 'number': // Number literal
    case 'atom': // Keyword literal (true, false, null)
      ret = token.value;
      break;
    default:
      // Unexpected token type to start a value
      raiseUnexpected(state, token, 'json value');
      // Attempt recovery in tolerant mode by returning null
      if (state.tolerant) {
        ret = null;
      } else {
        // Error already thrown
        return undefined; // Should be unreachable
      }
  }

  // If this is the top-level call (end === true)
  if (end) {
    // Apply the top-level reviver function (key is empty string)
    ret = state.reviver ? state.reviver('', ret) : ret;
    // Perform final checks for trailing tokens or accumulated warnings
    endChecks(tokens, state, ret);
  }

  return ret;
}

// --- Main Parse Function ---

// Public API: Parses a JSON (or relaxed JSON) string into a JavaScript value
// :: string -> * -> any
function parse(
  text: string,
  optsOrReviver?: ParseOptions | ((key: string, value: any) => any),
): any {
  let options: ParseOptions = {};

  // Determine if the second argument is options object or reviver function
  if (typeof optsOrReviver === 'function') {
    options.reviver = optsOrReviver;
  } else if (optsOrReviver !== null && typeof optsOrReviver === 'object') {
    options = { ...optsOrReviver }; // Shallow copy options
  } else if (optsOrReviver !== undefined) {
    throw new TypeError(
      'Second argument must be a reviver function or an options object.',
    );
  }

  // Set default options
  // Default to relaxed true ONLY IF no specific mode is set AND warnings/tolerant are not explicitly false.
  // If tolerant=true or warnings=true, imply relaxed=true unless explicitly set to false.
  // If strict JSON is desired, set relaxed: false explicitly.
  if (options.relaxed === undefined) {
    if (options.warnings === true || options.tolerant === true) {
      options.relaxed = true;
    } else if (options.warnings === false && options.tolerant === false) {
      options.relaxed = false; // Strict if tolerance/warnings explicitly off
    } else {
      options.relaxed = true; // Default to relaxed otherwise
    }
  }
  // Warnings implies tolerant
  options.tolerant = options.tolerant || options.warnings || false;
  options.warnings = options.warnings || false;
  options.duplicate = options.duplicate || false; // Default: check duplicates (false means check)

  // --- Parsing Strategy ---

  // Strategy 1: Strict JSON, no special handling -> use native JSON.parse for speed
  // Also use if relaxed=false and warnings=false (even if reviver is present)
  if (!options.relaxed && !options.warnings && !options.tolerant) {
    // Note: native JSON.parse doesn't have duplicate key check option.
    // If duplicate=false (meaning check), we can't use native parse directly if strict checking is required.
    // However, the original code falls back to transform+JSON.parse in this case. Let's match that.
    // If `options.duplicate` is true (allow duplicates), native parse works.
    // If `options.duplicate` is false (check duplicates), native parse doesn't check, so we *must* use custom path.
    if (!options.duplicate) {
      // Fall through to custom parser path to enforce duplicate check if needed.
    } else {
      // Use native parser if relaxed=false, warnings=false, tolerant=false, and duplicate=true (allow)
      return JSON.parse(text, options.reviver);
    }
  }

  // Strategy 2: Use custom lexer/parser
  // This is needed for: relaxed syntax, warning collection, tolerance, or strict duplicate checking.

  // Lex the input text based on the 'relaxed' option
  const lexerToUse = options.relaxed ? lexer : strictLexer;
  let tokens = lexerToUse(text);

  // Pre-processing for relaxed mode: strip trailing commas
  if (options.relaxed) {
    tokens = stripTrailingComma(tokens);
  }

  // If warnings or tolerance are enabled, use the full parser logic
  if (options.warnings || options.tolerant) {
    // Filter out whitespace tokens as they are not needed by the parser
    tokens = tokens.filter(token => token.type !== ' ');

    // Initialize the parser state
    const state: ParseState = {
      pos: 0,
      reviver: options.reviver,
      tolerant: options.tolerant,
      duplicate: !options.duplicate, // Internal state: true means *check* for duplicates
      warnings: [],
    };

    // Start parsing from the top level
    return parseAny(tokens, state, true);
  } else {
    // Strategy 3: Relaxed input, but no warnings/tolerance requested.
    // Transform the relaxed syntax to stricter JSON and use native JSON.parse.
    // This path is also used for strict mode (!relaxed) when duplicate checking is needed (!options.duplicate).
    const newtext = tokens.reduce((str, token) => {
      return str + token.match;
    }, '');

    // We might need a custom duplicate check *before* native parse here if options.duplicate is false.
    // However, the simplest way to check duplicates is during the custom parse.
    // Let's refine the logic: if duplicate checking is needed, always use the full custom parser.

    // --- Refined Strategy Selection ---
    if (
      !options.relaxed &&
      !options.warnings &&
      !options.tolerant &&
      options.duplicate /* allow dupes */
    ) {
      // Case 1: Strict, no warnings, no tolerance, allow duplicates => Native fastest
      return JSON.parse(text, options.reviver);
    } else if (
      options.warnings ||
      options.tolerant ||
      !options.duplicate /* check dupes */
    ) {
      // Case 2: Warnings OR Tolerance OR Strict Duplicate Check needed => Full custom parser
      tokens = lexerToUse(text);
      if (options.relaxed) {
        tokens = stripTrailingComma(tokens);
      }
      tokens = tokens.filter(token => token.type !== ' '); // Always filter whitespace for custom parser
      const state: ParseState = {
        pos: 0,
        reviver: options.reviver,
        tolerant: options.tolerant || false, // Ensure boolean
        duplicate: !options.duplicate, // true = check duplicates
        warnings: [],
      };
      return parseAny(tokens, state, true);
    } else {
      // Case 3: Relaxed, no warnings, no tolerance, allow duplicates => Lex, transform, native parse
      tokens = lexer(text); // Must be relaxed lexer here
      tokens = stripTrailingComma(tokens);
      const newtext = tokens.reduce((str, token) => str + token.match, '');
      return JSON.parse(newtext, options.reviver);
    }
  }
}

// --- Stringify Function (Basic Implementation) ---
// Note: This is a basic, non-configurable stringifier, mainly for potential internal use or testing.
// It doesn't handle replacer/space arguments like JSON.stringify.

// Helper for stringifying object pairs
// :: any -> string -> ... -> string
function stringifyPair(obj: { [key: string]: any }, key: string): string {
  // Stringify key and value, then join with colon
  // Recursively calls stringify for the value
  return JSON.stringify(key) + ':' + stringify(obj[key]); // eslint-disable-line no-use-before-define
}

// Basic JSON stringify implementation
// :: any -> ... -> string
function stringify(obj: any): string {
  const type = typeof obj;

  // Handle primitives directly using JSON.stringify (handles escaping etc.)
  if (
    type === 'string' ||
    type === 'number' ||
    type === 'boolean' ||
    obj === null
  ) {
    return JSON.stringify(obj);
  }

  // Handle undefined (represented as null in this basic version, JSON.stringify omits in objects/returns undefined at top level)
  if (type === 'undefined') {
    return 'null';
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    // Recursively stringify each element and join with commas
    const elements = obj.map(stringify).join(',');
    return '[' + elements + ']';
  }

  // Handle objects
  // Check if it's a non-null object (using constructor check is less robust than typeof + null check)
  if (type === 'object') {
    // Already checked for null and Array above
    // Get keys, sort them for consistent output (optional, but good practice)
    const keys = Object.keys(obj);
    keys.sort();
    // Stringify each key-value pair and join with commas
    const pairs = keys.map(key => stringifyPair(obj, key)).join(',');
    return '{' + pairs + '}';
  }

  // Fallback for unsupported types (like functions, symbols) - represent as null
  return 'null';
}

export { parse, stringify, transform };
