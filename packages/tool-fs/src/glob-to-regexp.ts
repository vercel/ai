const REGEXP_SPECIAL_CHARS = /[.*+?^${}()|[\]\\/]/;

function escapeRegExpChar(char: string): string {
  return REGEXP_SPECIAL_CHARS.test(char) ? `\\${char}` : char;
}

/**
 * Convert a glob pattern to a regular expression that matches whole paths.
 *
 * Supports `*` (any characters except `/`), `**` (any number of directories),
 * `?` (one character except `/`), `[abc]` and `[!abc]` character classes,
 * `{a,b}` alternatives, and `\` to escape the next character. Hidden files
 * are matched like any other file.
 */
export function globToRegExp(pattern: string): RegExp {
  let source = '';
  let braceDepth = 0;

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];

    switch (char) {
      case '\\': {
        index++;
        if (index < pattern.length) {
          source += escapeRegExpChar(pattern[index]);
        }
        break;
      }

      case '*': {
        if (pattern[index + 1] !== '*') {
          source += '[^/]*';
          break;
        }

        const atSegmentStart = index === 0 || pattern[index - 1] === '/';
        index++;
        if (atSegmentStart && pattern[index + 1] === '/') {
          // `**/` matches zero or more directories.
          index++;
          source += '(?:[^/]+/)*';
        } else if (atSegmentStart && index === pattern.length - 1) {
          // A trailing `**` matches everything below.
          source += '.*';
        } else {
          // `**` inside a segment behaves like `*`.
          source += '[^/]*';
        }
        break;
      }

      case '?': {
        source += '[^/]';
        break;
      }

      case '[': {
        const end = pattern.indexOf(']', index + 2);
        if (end === -1) {
          source += '\\[';
          break;
        }
        let set = pattern.slice(index + 1, end);
        const negated = set.startsWith('!') || set.startsWith('^');
        if (negated) {
          set = set.slice(1);
        }
        source += `[${negated ? '^/' : ''}${set.replace(/\\/g, '\\\\')}]`;
        index = end;
        break;
      }

      case '{': {
        braceDepth++;
        source += '(?:';
        break;
      }

      case '}': {
        if (braceDepth > 0) {
          braceDepth--;
          source += ')';
        } else {
          source += '\\}';
        }
        break;
      }

      case ',': {
        source += braceDepth > 0 ? '|' : ',';
        break;
      }

      default: {
        source += escapeRegExpChar(char);
      }
    }
  }

  source += ')'.repeat(braceDepth);

  return new RegExp(`^${source}$`);
}
