import { shellQuote } from '@ai-sdk/harness/utils';
import type {
  FxGlobFilesInput,
  FxGrepFilesInput,
} from './fx-builtin-tool-specs';
import type { FxBuiltinToolOutput, FxToolSandbox } from './fx-builtin-tools';
import {
  decodeFxModelSafeText,
  getUtf8ByteLength,
  isFxToolOutput,
  readFxIntegerField,
  resolveFxPathField,
  toFxToolError,
  type FxToolPath,
} from './fx-tool-paths';

/*
 * fx's limits for its search tools: `default_max_list_entries` and
 * `default_max_read_file_line_len` in `tool_dispatch.zig`,
 * `max_pattern_bytes` in `glob_pattern.zig`, and `context_lines_cap` and
 * `context_file_byte_cap` in `grep_files.zig`, all at
 * https://github.com/vercel-labs/fx/tree/v0.0.16/src
 */
const LIST_ENTRIES = 100;
const LINE_LENGTH = 2000;
const PATTERN_BYTES = 4096;
const CONTEXT_LINES = 5;
const CONTEXT_FILE_BYTES = 200 * 1024;

/*
 * Directory names fx's search tools skip while walking a search root
 * (`ignored_list_entries` in fx's `main.zig`). A search root that is itself
 * inside one of them is still searched.
 */
const IGNORED_DIRECTORIES = [
  '.git',
  '.zig-cache',
  'zig-out',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
];

/**
 * Returns whether one path segment matches one glob segment: `*` matches
 * any run of characters and `?` any single character, both within the
 * segment.
 */
function matchesGlobSegment(options: {
  /**
   * Glob segment.
   */
  pattern: string;

  /**
   * Path segment.
   */
  candidate: string;
}): boolean {
  const { pattern, candidate } = options;
  let p = 0;
  let c = 0;
  let starP = -1;
  let starC = 0;
  while (c < candidate.length) {
    if (p < pattern.length) {
      if (pattern[p] === '*') {
        while (p < pattern.length && pattern[p] === '*') p++;
        if (p === pattern.length) return true;
        starP = p;
        starC = c;
        continue;
      }
      if (pattern[p] === '?' || pattern[p] === candidate[c]) {
        p++;
        c++;
        continue;
      }
    }
    if (starP === -1) return false;
    starC++;
    c = starC;
    p = starP;
  }
  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}

/**
 * Returns whether a relative path matches a glob pattern with fx's rules
 * (`glob_pattern.zig`): `*` and `?` match within a segment, a `**` segment
 * matches any number of segments, and nothing else is special. A pattern
 * without `/` matches the path's last segment.
 */
export function matchesFxGlob(options: {
  /**
   * Glob pattern.
   */
  pattern: string;

  /**
   * Relative path, with `/` separators.
   */
  path: string;
}): boolean {
  const { pattern, path } = options;
  if (!pattern.includes('/')) {
    return matchesGlobSegment({
      pattern,
      candidate: path.slice(path.lastIndexOf('/') + 1),
    });
  }
  const segments = pattern
    .split('/')
    .filter((segment, index, all) => segment !== '' || index < all.length - 1);
  const parts = path === '' ? [] : path.split('/');

  /*
   * `previous[i]` tells whether the first `i` pattern segments match the
   * path segments seen so far; a `**` segment may match none of them.
   */
  let previous = [...segments.map(() => false), false];
  previous[0] = true;
  for (let i = 0; i < segments.length; i++) {
    previous[i + 1] = previous[i] && segments[i] === '**';
  }
  for (const part of parts) {
    const current = [...segments.map(() => false), false];
    for (let i = 0; i < segments.length; i++) {
      current[i + 1] =
        segments[i] === '**'
          ? current[i] || previous[i + 1]
          : previous[i] &&
            matchesGlobSegment({ pattern: segments[i], candidate: part });
    }
    previous = current;
  }
  return previous[segments.length];
}

/**
 * Returns whether a path has a hidden directory segment, i.e. one starting
 * with `.` other than `.` and `..`.
 */
function hasHiddenDirectory(options: {
  /**
   * Directory segments to check.
   */
  segments: string[];
}): boolean {
  return options.segments.some(
    segment => segment.startsWith('.') && segment !== '.' && segment !== '..',
  );
}

/**
 * Returns how fx shows a path below a search root: relative to the working
 * directory when the root is.
 */
function toShownPath(options: {
  /**
   * Search root.
   */
  root: FxToolPath;

  /**
   * Path relative to the search root.
   */
  relative: string;
}): string {
  const { root, relative } = options;
  return root.rel === '.' ? relative : `${root.rel}/${relative}`;
}

/**
 * Lists the files below a search root in the sandbox, relative to the root,
 * skipping fx's ignored directories and, unless `includeHidden` is set,
 * hidden directories. Throws when the listing fails.
 */
async function listFiles(options: {
  /**
   * Sandbox to list files on.
   */
  sandbox: FxToolSandbox;

  /**
   * Absolute search root.
   */
  root: string;

  /**
   * Whether to descend into hidden directories.
   */
  includeHidden: boolean;

  /**
   * Aborts the listing.
   */
  abortSignal: AbortSignal;
}): Promise<string[]> {
  const { sandbox, root, includeHidden, abortSignal } = options;
  const names = [...IGNORED_DIRECTORIES, ...(includeHidden ? [] : ['.*'])];
  const nameExpression = names
    .map(name => `-name ${shellQuote(name)}`)
    .join(' -o ');
  const result = await sandbox.session.run({
    command: `find ${shellQuote(root)} -mindepth 1 -type d \\( ${nameExpression} \\) -prune -o -type f -print`,
    abortSignal,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || `find failed with exit code ${result.exitCode}`,
    );
  }
  const prefix = root === '/' ? '/' : `${root}/`;
  return result.stdout
    .split('\n')
    .filter(line => line.startsWith(prefix))
    .map(line => line.slice(prefix.length))
    .sort();
}

/**
 * Runs fx's `glob_files` on the sandbox: lists up to 100 files below the
 * search root (sorted, skipping fx's ignored and hidden directories) whose
 * root-relative path matches the pattern, or counts all matches.
 */
export async function globFxFiles(options: {
  /**
   * Sandbox the tool runs on.
   */
  sandbox: FxToolSandbox;

  /**
   * Tool input given by the model.
   */
  input: FxGlobFilesInput;

  /**
   * Aborts the tool.
   */
  abortSignal: AbortSignal;
}): Promise<FxBuiltinToolOutput> {
  const { sandbox, input, abortSignal } = options;
  if (typeof input.pattern !== 'string') {
    return toFxToolError({
      text: 'glob_files field "pattern" must be a string',
    });
  }
  const { pattern } = input;
  if (getUtf8ByteLength(pattern) > PATTERN_BYTES) {
    return toFxToolError({
      text: `glob_files field "pattern" must be at most ${PATTERN_BYTES} bytes`,
    });
  }
  const mode = input.mode ?? 'matches';
  if (mode !== 'matches' && mode !== 'count') {
    return toFxToolError({
      text: 'glob_files field "mode" must be matches or count',
    });
  }
  const root = resolveFxPathField({
    toolName: 'glob_files',
    field: 'path',
    value: input.path,
    optional: true,
    workDir: sandbox.workDir,
    home: sandbox.home,
  });
  if (isFxToolOutput(root)) return root;
  const stat = await sandbox.session.stat({ path: root.abs, abortSignal });
  if (stat == null) {
    return toFxToolError({
      text: `Unable to resolve glob search root: ${String(input.path)} (FileNotFound)`,
    });
  }

  const matches: string[] = [];
  let count = 0;
  let truncated = false;
  if (stat.type === 'file') {
    const basename = root.rel.slice(root.rel.lastIndexOf('/') + 1);
    if (matchesFxGlob({ pattern, path: basename })) {
      count = 1;
      matches.push(root.rel);
    }
  } else {
    const files = await listFiles({
      sandbox,
      root: root.abs,
      includeHidden:
        hasHiddenDirectory({ segments: root.rel.split('/') }) ||
        hasHiddenDirectory({ segments: pattern.split('/').slice(0, -1) }),
      abortSignal,
    });
    for (const relative of files) {
      if (!matchesFxGlob({ pattern, path: relative })) continue;
      count++;
      if (mode === 'count') continue;
      if (matches.length >= LIST_ENTRIES) {
        truncated = true;
        break;
      }
      matches.push(toShownPath({ root, relative }));
    }
  }

  if (mode === 'count') {
    return { text: `[glob] count ${count} matches for ${pattern}\n` };
  }
  if (matches.length === 0) {
    return { text: `[glob] no matches for ${pattern}\n` };
  }
  let out = `[glob] ${matches.length} matches for ${pattern}\n`;
  for (const match of matches) out += ` - ${match}\n`;
  if (truncated) out += `... truncated to first ${LIST_ENTRIES} matches\n`;
  return { text: out };
}

/**
 * One matching line found by `grep_files`.
 */
type GrepMatch = {
  /**
   * Path of the file as fx shows it.
   */
  path: string;

  /**
   * Absolute path of the file.
   */
  abs: string;

  /**
   * Path of the file relative to the search root.
   */
  relative: string;

  /**
   * 1-based line number.
   */
  line: number;

  /**
   * Text of the line.
   */
  text: string;
};

/**
 * Clips a line at fx's line length.
 */
function clipLine(line: string): string {
  return line.length > LINE_LENGTH ? `${line.slice(0, LINE_LENGTH)}...` : line;
}

const RECURSIVE_GREP_LINE = /^(.*?):(\d+):(.*)$/;
const SINGLE_FILE_GREP_LINE = /^(\d+):(.*)$/;

/**
 * Runs fx's `grep_files` on the sandbox: a literal search below the search
 * root (skipping fx's ignored directories and binary files) with fx's
 * output modes, `include` filter, pagination and context lines.
 *
 * The search runs the sandbox's `grep -rn -F`; files with NUL bytes in
 * matching lines are treated as binary and skipped. Context lines are read
 * only for the matches on the returned page.
 */
export async function grepFxFiles(options: {
  /**
   * Sandbox the tool runs on.
   */
  sandbox: FxToolSandbox;

  /**
   * Tool input given by the model.
   */
  input: FxGrepFilesInput;

  /**
   * Aborts the tool.
   */
  abortSignal: AbortSignal;
}): Promise<FxBuiltinToolOutput> {
  const { sandbox, input, abortSignal } = options;
  if (typeof input.pattern !== 'string' || input.pattern === '') {
    return toFxToolError({
      text: 'grep_files field "pattern" must be a non-empty string',
    });
  }
  const { pattern } = input;
  const mode = input.mode ?? 'matches';
  if (mode !== 'matches' && mode !== 'files_with_matches' && mode !== 'count') {
    return toFxToolError({
      text: 'grep_files field "mode" must be matches, files_with_matches or count',
    });
  }
  if (input.include != null && typeof input.include !== 'string') {
    return toFxToolError({
      text: 'grep_files field "include" must be a string',
    });
  }
  const include = input.include ?? undefined;
  if (include !== undefined && getUtf8ByteLength(include) > PATTERN_BYTES) {
    return toFxToolError({
      text: `grep_files field "include" must be at most ${PATTERN_BYTES} bytes`,
    });
  }
  if (
    input.case_insensitive != null &&
    typeof input.case_insensitive !== 'boolean'
  ) {
    return toFxToolError({
      text: 'grep_files field "case_insensitive" must be a boolean',
    });
  }
  const headLimit = readFxIntegerField({
    toolName: 'grep_files',
    field: 'head_limit',
    value: input.head_limit,
    min: 1,
  });
  if (isFxToolOutput(headLimit)) return headLimit;
  const offset = readFxIntegerField({
    toolName: 'grep_files',
    field: 'offset',
    value: input.offset,
    min: 0,
  });
  if (isFxToolOutput(offset)) return offset;
  const contextLines = readFxIntegerField({
    toolName: 'grep_files',
    field: 'context_lines',
    value: input.context_lines,
    min: 0,
  });
  if (isFxToolOutput(contextLines)) return contextLines;
  const root = resolveFxPathField({
    toolName: 'grep_files',
    field: 'path',
    value: input.path,
    optional: true,
    workDir: sandbox.workDir,
    home: sandbox.home,
  });
  if (isFxToolOutput(root)) return root;
  const stat = await sandbox.session.stat({ path: root.abs, abortSignal });
  if (stat == null) {
    return toFxToolError({
      text: `Unable to stat search root: ${root.abs} (FileNotFound)`,
    });
  }

  const isFile = stat.type === 'file';
  const flags = [
    '-n',
    ...(isFile
      ? []
      : ['-r', ...IGNORED_DIRECTORIES.map(name => `--exclude-dir=${name}`)]),
    ...(input.case_insensitive === true ? ['-i'] : []),
    '-F',
  ];
  const result = await sandbox.session.run({
    command: isFile
      ? `grep ${flags.map(shellQuote).join(' ')} -e ${shellQuote(pattern)} ${shellQuote(root.abs)}`
      : `cd ${shellQuote(root.abs)} && grep ${flags.map(shellQuote).join(' ')} -e ${shellQuote(pattern)} .`,
    abortSignal,
  });
  if (result.exitCode > 1 && result.stdout.trim() === '') {
    return toFxToolError({
      text: `grep_files failed: ${result.stderr.trim() || `grep exited with code ${result.exitCode}`}`,
    });
  }

  const matches: GrepMatch[] = [];
  for (const line of result.stdout.split('\n')) {
    if (line === '' || line.includes('\u0000')) continue;
    if (isFile) {
      const parsed = SINGLE_FILE_GREP_LINE.exec(line);
      if (parsed == null) continue;
      matches.push({
        path: root.rel,
        abs: root.abs,
        relative: root.rel,
        line: Number(parsed[1]),
        text: parsed[2],
      });
      continue;
    }
    const parsed = RECURSIVE_GREP_LINE.exec(line);
    if (parsed == null) continue;
    const relative = parsed[1].replace(/^\.\//, '');
    matches.push({
      path: toShownPath({ root, relative }),
      abs: root.abs === '/' ? `/${relative}` : `${root.abs}/${relative}`,
      relative,
      line: Number(parsed[2]),
      text: parsed[3],
    });
  }
  const filtered = matches
    .filter(
      match =>
        include === undefined ||
        matchesFxGlob({ pattern: include, path: match.relative }),
    )
    .sort((left, right) =>
      left.path === right.path
        ? left.line - right.line
        : left.path < right.path
          ? -1
          : 1,
    );

  if (mode === 'count') {
    const files = new Set(filtered.map(match => match.path)).size;
    return {
      text: `[grep] count ${filtered.length} matching lines in ${files} files for ${pattern}\n`,
    };
  }
  const limit = Math.min(headLimit ?? LIST_ENTRIES, LIST_ENTRIES);
  const from = offset ?? 0;

  if (mode === 'files_with_matches') {
    const paths = [...new Set(filtered.map(match => match.path))];
    const start = Math.min(from, paths.length);
    const end = Math.min(start + limit, paths.length);
    let out: string;
    if (paths.length === 0) {
      out = `[grep] no files with matches for ${pattern}\n`;
    } else if (end === start) {
      out = `[grep] no files with matches for ${pattern} at offset ${from} (${paths.length} total files)\n`;
    } else {
      out =
        start === 0 && end === paths.length
          ? `[grep] ${end - start} files with matches for ${pattern}\n`
          : `[grep] ${end - start} files with matches for ${pattern} (showing ${start + 1}-${end} of ${paths.length})\n`;
      for (const path of paths.slice(start, end)) out += ` - ${path}\n`;
    }
    if (end < paths.length) {
      out += `... more files available; use offset ${end} to continue\n`;
    }
    return { text: out };
  }

  const around = Math.min(contextLines ?? 0, CONTEXT_LINES);
  const start = Math.min(from, filtered.length);
  const end = Math.min(start + limit, filtered.length);
  let out: string;
  if (filtered.length === 0) {
    out = `[grep] no matches for ${pattern}\n`;
  } else if (end === start) {
    out = `[grep] no matches for ${pattern} at offset ${from} (${filtered.length} total matches)\n`;
  } else {
    out =
      start === 0 && end === filtered.length
        ? `[grep] ${end - start} matches for ${pattern}\n`
        : `[grep] ${end - start} matches for ${pattern} (showing ${start + 1}-${end} of ${filtered.length})\n`;
    const fileLines = new Map<string, string[] | undefined>();
    for (const match of filtered.slice(start, end)) {
      let lines: string[] | undefined;
      if (around > 0) {
        if (!fileLines.has(match.abs)) {
          const bytes = await sandbox.session.readBinaryFile({
            path: match.abs,
            abortSignal,
          });
          const text =
            bytes != null && bytes.length <= CONTEXT_FILE_BYTES
              ? decodeFxModelSafeText({ bytes })
              : undefined;
          const split = text?.split('\n');
          if (split?.at(-1) === '') split.pop();
          fileLines.set(match.abs, split);
        }
        lines = fileLines.get(match.abs);
      }
      if (lines != null) {
        for (let n = Math.max(1, match.line - around); n < match.line; n++) {
          out += `   ${match.path}:${n}- ${clipLine(lines[n - 1] ?? '')}\n`;
        }
      }
      out += ` - ${match.path}:${match.line}: ${clipLine(match.text)}\n`;
      if (lines != null) {
        const last = Math.min(lines.length, match.line + around);
        for (let n = match.line + 1; n <= last; n++) {
          out += `   ${match.path}:${n}- ${clipLine(lines[n - 1])}\n`;
        }
      }
    }
  }
  if (end < filtered.length) {
    out += `... more matches available; use offset ${end} to continue\n`;
  }
  return { text: out };
}
