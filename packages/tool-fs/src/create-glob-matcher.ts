const MAX_PATTERN_LENGTH = 1024;
export const MAX_GLOB_PATH_LENGTH = 4096;
const MAX_MATCH_STEPS = 1_000_000;

type State = {
  test?: (char: string) => boolean;
  next: number[];
};

/**
 * Compile a glob to a nondeterministic finite automaton. Each state is visited
 * at most once per input character, without backtracking or brace expansion.
 * The work budget is shared by every path tested with this matcher.
 */
export function createGlobMatcher(pattern: string) {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(
      `Glob patterns must not exceed ${MAX_PATTERN_LENGTH} characters.`,
    );
  }

  const states: State[] = [{ next: [] }];
  const braces: { start: number; ends: number[] }[] = [];
  let current = 0;

  function append(test: (char: string) => boolean, repeat = false) {
    const consuming = states.length;
    const end = consuming + 1;
    states[current].next.push(consuming);
    if (repeat) {
      states[current].next.push(end);
    }
    states.push(
      { test, next: repeat ? [consuming, end] : [end] },
      { next: [] },
    );
    current = end;
  }

  function closeBrace() {
    const brace = braces.pop()!;
    const end = states.length;
    states.push({ next: [] });
    for (const branchEnd of [...brace.ends, current]) {
      states[branchEnd].next.push(end);
    }
    current = end;
  }

  const nonSlash = (char: string) => char !== '/';

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    switch (char) {
      case '\\': {
        index++;
        if (index < pattern.length) {
          const literal = pattern[index];
          append(char => char === literal);
        }
        break;
      }
      case '*': {
        if (pattern[index + 1] !== '*') {
          append(nonSlash, true);
          break;
        }
        const atSegmentStart = index === 0 || pattern[index - 1] === '/';
        index++;
        if (atSegmentStart && pattern[index + 1] === '/') {
          index++;
          const start = current;
          append(nonSlash);
          states[current].next.push(states.length - 2);
          append(char => char === '/');
          states[current].next.push(start);
          states[start].next.push(current);
        } else if (atSegmentStart && index === pattern.length - 1) {
          append(char => !'\n\r\u2028\u2029'.includes(char), true);
        } else {
          append(nonSlash, true);
        }
        break;
      }
      case '?': {
        append(nonSlash);
        break;
      }
      case '[': {
        const end = pattern.indexOf(']', index + 2);
        if (end === -1) {
          append(char => char === '[');
          break;
        }
        let set = pattern.slice(index + 1, end);
        const negated = set.startsWith('!') || set.startsWith('^');
        if (negated) {
          set = set.slice(1);
        }
        // Only a single character class is compiled as a regex. Escape `]`
        // and backslashes so class contents cannot introduce regex operators.
        const escaped = set.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
        const matcher = new RegExp(`^[${negated ? '^/' : ''}${escaped}]$`);
        append(char => matcher.test(char));
        index = end;
        break;
      }
      case '{': {
        braces.push({ start: current, ends: [] });
        break;
      }
      case ',': {
        const brace = braces[braces.length - 1];
        if (brace === undefined) {
          append(char => char === ',');
        } else {
          brace.ends.push(current);
          current = brace.start;
        }
        break;
      }
      case '}': {
        if (braces.length === 0) {
          append(char => char === '}');
        } else {
          closeBrace();
        }
        break;
      }
      default: {
        append(candidate => candidate === char);
      }
    }
  }
  while (braces.length > 0) {
    closeBrace();
  }
  const accept = current;
  let remainingSteps = MAX_MATCH_STEPS;

  function step() {
    if (--remainingSteps < 0) {
      throw new Error(
        'Glob matching work limit exceeded. Use a more specific pattern or path.',
      );
    }
  }

  function closure(initial: Iterable<number>): Set<number> {
    const pending = [...initial];
    const seen = new Set<number>();
    const active = new Set<number>();
    while (pending.length > 0) {
      step();
      const index = pending.pop()!;
      if (seen.has(index)) {
        continue;
      }
      seen.add(index);
      const state = states[index];
      if (state.test !== undefined || index === accept) {
        active.add(index);
      }
      if (state.test === undefined) {
        pending.push(...state.next);
      }
    }
    return active;
  }

  return {
    test(path: string): boolean {
      if (path.length > MAX_GLOB_PATH_LENGTH) {
        throw new Error(
          `Glob paths must not exceed ${MAX_GLOB_PATH_LENGTH} characters.`,
        );
      }
      let active = closure([0]);
      for (let index = 0; index < path.length; index++) {
        const next: number[] = [];
        for (const stateIndex of active) {
          step();
          const state = states[stateIndex];
          if (state.test?.(path[index])) {
            next.push(...state.next);
          }
        }
        active = closure(next);
        if (active.size === 0) {
          return false;
        }
      }
      return active.has(accept);
    },
  };
}
