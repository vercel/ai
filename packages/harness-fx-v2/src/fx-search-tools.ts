import { shellQuote } from '@ai-sdk/harness/utils';
import type {
  FxGlobFilesInput,
  FxGrepFilesInput,
} from './fx-builtin-tool-specs';
import type { FxBuiltinToolOutput, FxToolSandbox } from './fx-builtin-tools';
import { readFileWithin } from './fx-file-tools';
import { createFxOutputCapture, readFxChunks } from './fx-sandbox-output';
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
 * Bytes of a search command's output and error that the host keeps: enough
 * for a normal repository's listing or match set, so that a larger one is
 * reported as cut off instead of being held in host memory.
 */
const MiB = 1024 * 1024;
const MAX_SEARCH_OUTPUT_BYTES = 8 * MiB;
const MAX_SEARCH_ERROR_BYTES = 8 * 1024;
const MAX_SEARCH_MATCHES = 20_000;
const MAX_LIST_ENTRIES = 100_000;

/**
 * Runs a search command and keeps at most `MAX_SEARCH_OUTPUT_BYTES` of its
 * standard output and `MAX_SEARCH_ERROR_BYTES` of its standard error,
 * stopping the command once it prints more, so that a search over a large
 * sandbox repository cannot fill the host's memory.
 */
async function runSearchCommand(options: {
  /**
   * Sandbox to run the command in.
   */
  sandbox: FxToolSandbox;

  /**
   * Command to run.
   */
  command: string;

  /**
   * Aborts the command.
   */
  abortSignal: AbortSignal;
}): Promise<{
  /**
   * Standard output, at most `MAX_SEARCH_OUTPUT_BYTES` of it.
   */
  stdout: string;

  /**
   * Standard error, at most `MAX_SEARCH_ERROR_BYTES` of it.
   */
  stderr: string;

  /**
   * Exit code of the command, absent when stopping it ended it.
   */
  exitCode?: number;

  /**
   * Whether the command printed more than the kept output.
   */
  truncated: boolean;
}> {
  const { sandbox, command, abortSignal } = options;
  const capture = createFxOutputCapture({
    headBytes: MAX_SEARCH_OUTPUT_BYTES,
    tailBytes: 0,
  });
  const errorCapture = createFxOutputCapture({
    headBytes: MAX_SEARCH_ERROR_BYTES,
    tailBytes: 0,
  });
  const limitController = new AbortController();
  let truncated = false;
  const onChunk = (chunk: Uint8Array) => {
    capture.add(chunk);
    if (!truncated && !capture.complete) {
      truncated = true;
      limitController.abort(new Error('search output limit'));
    }
  };
  const onError = (chunk: Uint8Array) => {
    errorCapture.add(chunk);
  };
  const commandAbortSignal = AbortSignal.any([
    abortSignal,
    limitController.signal,
  ]);
  const child = await sandbox.session.spawn({
    command,
    workingDirectory: sandbox.workDir,
    abortSignal: commandAbortSignal,
  });
  let exitCode: number | undefined;
  try {
    const [result] = await Promise.all([
      child.wait(),
      readFxChunks({
        stream: child.stdout,
        onChunk,
        abortSignal: commandAbortSignal,
      }),
      readFxChunks({
        stream: child.stderr,
        onChunk: onError,
        abortSignal: commandAbortSignal,
      }),
    ]);
    exitCode = result.exitCode;
  } catch (error) {
    if (abortSignal.aborted) throw error;
    if (!truncated) throw error;
  }
  if (truncated) {
    try {
      void Promise.resolve(child.kill()).catch(() => {});
    } catch {
      // Ignore a sandbox that cannot stop the command.
    }
  }
  const kept = capture.toBytes();
  /*
   * Stopping the command can cut its last line in the middle, and a partial
   * path or match would be reported as a result, so the cut line is dropped.
   */
  const complete = truncated
    ? kept.subarray(0, kept.lastIndexOf(0x0a) + 1)
    : kept;
  const decode = (bytes: Uint8Array) => Buffer.from(bytes).toString('utf8');
  return {
    stdout: decode(complete),
    stderr: decode(errorCapture.toBytes()),
    exitCode,
    truncated,
  };
}

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
 * hidden directories. Throws when the listing fails. The listing keeps at
 * most `MAX_SEARCH_OUTPUT_BYTES` of file names, and `truncated` says whether
 * the root holds more files.
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
}): Promise<{ files: string[]; truncated: boolean }> {
  const { sandbox, root, includeHidden, abortSignal } = options;
  const names = [...IGNORED_DIRECTORIES, ...(includeHidden ? [] : ['.*'])];
  const nameExpression = names
    .map(name => `-name ${shellQuote(name)}`)
    .join(' -o ');
  const result = await runSearchCommand({
    sandbox,
    command: `find ${shellQuote(root)} -mindepth 1 -type d \\( ${nameExpression} \\) -prune -o -type f -print`,
    abortSignal,
  });
  if (!result.truncated && result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || `find failed with exit code ${result.exitCode}`,
    );
  }
  const prefix = root === '/' ? '/' : `${root}/`;
  const files: string[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line.startsWith(prefix)) continue;
    if (files.length >= MAX_LIST_ENTRIES) {
      return { files, truncated: true };
    }
    files.push(line.slice(prefix.length));
  }
  return { files: files.sort(), truncated: result.truncated };
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
  let listingTruncated = false;
  if (stat.type === 'file') {
    const basename = root.rel.slice(root.rel.lastIndexOf('/') + 1);
    if (matchesFxGlob({ pattern, path: basename })) {
      count = 1;
      matches.push(root.rel);
    }
  } else {
    const listing = await listFiles({
      sandbox,
      root: root.abs,
      includeHidden:
        hasHiddenDirectory({ segments: root.rel.split('/') }) ||
        hasHiddenDirectory({ segments: pattern.split('/').slice(0, -1) }),
      abortSignal,
    });
    listingTruncated = listing.truncated;
    for (const relative of listing.files) {
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
    const notice = listingTruncated
      ? ' (at least; the file listing was cut off)'
      : '';
    return {
      text: `[glob] count ${count} matches for ${pattern}${notice}\n`,
    };
  }
  if (matches.length === 0) {
    const notice = listingTruncated
      ? ` in the listed part; the file listing was cut off after ${MAX_SEARCH_OUTPUT_BYTES} bytes`
      : '';
    return { text: `[glob] no matches for ${pattern}${notice}\n` };
  }
  let out = `[glob] ${matches.length} matches for ${pattern}\n`;
  for (const match of matches) out += ` - ${match}\n`;
  if (truncated) out += `... truncated to first ${LIST_ENTRIES} matches\n`;
  if (listingTruncated) {
    out += `... the file listing was cut off after ${MAX_SEARCH_OUTPUT_BYTES} bytes; narrow the search path\n`;
  }
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
 * Reads the lines of a file for grep's context lines: at most
 * `CONTEXT_FILE_BYTES`, and nothing at all for a file whose stat shows more,
 * so that a large matching file is never loaded into host memory.
 */
async function readContextLines(options: {
  /**
   * Sandbox the file is in.
   */
  sandbox: FxToolSandbox;

  /**
   * Absolute path of the file.
   */
  path: string;

  /**
   * Aborts the read.
   */
  abortSignal: AbortSignal;
}): Promise<string[] | undefined> {
  const { sandbox, path, abortSignal } = options;
  const stat = await sandbox.session.stat({ path, abortSignal });
  if (stat == null || stat.type !== 'file' || stat.size > CONTEXT_FILE_BYTES) {
    return undefined;
  }
  const snapshot = await readFileWithin({
    sandbox,
    path,
    limitBytes: CONTEXT_FILE_BYTES,
    abortSignal,
  });
  if (!snapshot.complete) return undefined;
  const text = decodeFxModelSafeText({ bytes: snapshot.bytes });
  const lines = text?.split('\n');
  if (lines?.at(-1) === '') lines.pop();
  return lines;
}

/**
 * Returns a count as fx shows it, marked as a lower bound when the search
 * that produced it was cut off.
 */
function approximate(options: {
  /**
   * Count of what was found.
   */
  count: number;

  /**
   * Whether the search was cut off.
   */
  cutOff: boolean;
}): string {
  const { count, cutOff } = options;
  return cutOff ? `at least ${count}` : `${count}`;
}

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
  const result = await runSearchCommand({
    sandbox,
    command: isFile
      ? `grep ${flags.map(shellQuote).join(' ')} -e ${shellQuote(pattern)} ${shellQuote(root.abs)}`
      : `cd ${shellQuote(root.abs)} && grep ${flags.map(shellQuote).join(' ')} -e ${shellQuote(pattern)} .`,
    abortSignal,
  });
  if (
    !result.truncated &&
    result.exitCode != null &&
    result.exitCode > 1 &&
    result.stdout.trim() === ''
  ) {
    return toFxToolError({
      text: `grep_files failed: ${result.stderr.trim() || `grep exited with code ${result.exitCode}`}`,
    });
  }
  const matches: GrepMatch[] = [];
  let matchesCapped = false;
  const stdout = result.stdout;
  for (let at = 0; at < stdout.length; ) {
    const end = stdout.indexOf('\n', at);
    const line = stdout.slice(at, end === -1 ? stdout.length : end);
    at = end === -1 ? stdout.length : end + 1;
    if (matches.length >= MAX_SEARCH_MATCHES) {
      matchesCapped = true;
      break;
    }
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
  /*
   * A stopped command and a capped match list both mean the matches are a
   * prefix of the search's, so totals are lower bounds.
   */
  const cutoffNotice =
    result.truncated || matchesCapped
      ? `... grep output was cut off after ${MAX_SEARCH_OUTPUT_BYTES} bytes; narrow the pattern, the include filter, or the search path\n`
      : '';
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
    const notice =
      cutoffNotice === '' ? '' : ' (at least; the grep output was cut off)';
    return {
      text: `[grep] count ${filtered.length} matching lines in ${files} files for ${pattern}${notice}\n`,
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
      out = `[grep] no files with matches for ${pattern} at offset ${from} (${approximate({ count: paths.length, cutOff: cutoffNotice !== '' })} total files)\n`;
    } else {
      out =
        start === 0 && end === paths.length
          ? `[grep] ${end - start} files with matches for ${pattern}\n`
          : `[grep] ${end - start} files with matches for ${pattern} (showing ${start + 1}-${end} of ${approximate({ count: paths.length, cutOff: cutoffNotice !== '' })})\n`;
      for (const path of paths.slice(start, end)) out += ` - ${path}\n`;
    }
    if (end < paths.length) {
      out += `... more files available; use offset ${end} to continue\n`;
    }
    return { text: out + cutoffNotice };
  }

  const around = Math.min(contextLines ?? 0, CONTEXT_LINES);
  const start = Math.min(from, filtered.length);
  const end = Math.min(start + limit, filtered.length);
  let out: string;
  if (filtered.length === 0) {
    out = `[grep] no matches for ${pattern}\n`;
  } else if (end === start) {
    out = `[grep] no matches for ${pattern} at offset ${from} (${approximate({ count: filtered.length, cutOff: cutoffNotice !== '' })} total matches)\n`;
  } else {
    out =
      start === 0 && end === filtered.length
        ? `[grep] ${end - start} matches for ${pattern}\n`
        : `[grep] ${end - start} matches for ${pattern} (showing ${start + 1}-${end} of ${approximate({ count: filtered.length, cutOff: cutoffNotice !== '' })})\n`;
    const fileLines = new Map<string, string[] | undefined>();
    for (const match of filtered.slice(start, end)) {
      let lines: string[] | undefined;
      if (around > 0) {
        if (!fileLines.has(match.abs)) {
          fileLines.set(
            match.abs,
            await readContextLines({
              sandbox,
              path: match.abs,
              abortSignal,
            }),
          );
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
  return { text: out + cutoffNotice };
}
