import { shellQuote } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import {
  createGrepTool,
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateLine,
  type GrepToolDetails,
  type GrepToolInput,
} from '@earendil-works/pi-coding-agent';
import path from 'node:path';

const DEFAULT_LIMIT = 100;
const GREP_MAX_LINE_LENGTH = 500;
const EXCLUDED_DIRECTORIES = ['.git', 'node_modules'];

/**
 * Characters of a line that the search transfers for a match or for context.
 * 500 of them, and the path and line number come first, so a matching line
 * that is far longer than the result shows does not fill the host's memory
 * while every match stays in the result.
 */
const LINE_MAX_CHARS = 4096;

/**
 * Bytes of matching lines that one search may transfer, as a backstop for a
 * large `limit` over very long lines.
 */
const MATCH_MAX_BYTES = 1024 * 1024;

/**
 * Marker that ends a search inside the capped stream. Neither a file name nor a
 * match line can produce it, because both are stripped of NUL bytes, so its
 * absence means the byte cap cut the output.
 */
const END_MARKER = '\0/pi-grep-complete\0';

/**
 * Bytes of context lines that one matching file may add to the result. The
 * lines are read in the sandbox, so this bounds the transfer and the host's
 * memory for a file whose lines are very long.
 */
const CONTEXT_MAX_BYTES = 256 * 1024;

/**
 * Bytes of context lines that all matching files of one search may add, so a
 * search that matches many large files stays bounded.
 */
const CONTEXT_BUDGET_BYTES = 1024 * 1024;

/**
 * Line ranges that one file's context read may ask for, so a large `limit`
 * over matches in one file does not build an oversized sandbox command.
 */
const CONTEXT_MAX_RANGES = 500;

/**
 * One matching line found by the sandbox search.
 */
type GrepMatch = {
  /**
   * Path of the file, relative to the searched directory.
   */
  relativePath: string;

  /**
   * One-based number of the matching line.
   */
  lineNumber: number;

  /**
   * Text of the matching line.
   */
  lineText: string;
};

/**
 * Parses the number of a line that `grep -n` reported, or `undefined` when the
 * sandbox printed something that is not a positive safe integer. A line number
 * that a filename or a file could forge would otherwise drive the context
 * rendering.
 */
function parseLineNumber(options: {
  /**
   * Digits of the line number.
   */
  text: string;
}): number | undefined {
  const lineNumber = Number(options.text);
  return Number.isSafeInteger(lineNumber) && lineNumber > 0
    ? lineNumber
    : undefined;
}

/**
 * Parses the matches of one file out of `grep -n` output, which prints
 * `line:text` for an explicit file.
 */
function parseMatchLines(options: {
  /**
   * Output of the search for one file.
   */
  output: string;

  /**
   * Path to report for the matches.
   */
  relativePath: string;
}): GrepMatch[] {
  const matches: GrepMatch[] = [];
  for (const line of options.output.split('\n')) {
    const match = /^(\d+):(.*)$/s.exec(line);
    if (match == null) continue;
    const lineNumber = parseLineNumber({ text: match[1] ?? '' });
    if (lineNumber == null) continue;
    matches.push({
      relativePath: options.relativePath,
      lineNumber,
      lineText: match[2] ?? '',
    });
  }
  return matches;
}

/**
 * Whether a path that the sandbox listed stays inside the searched directory.
 *
 * A file name that contains a newline reaches the search as several names, and
 * the text of a file can imitate the framing, so a listed path is checked
 * before its matches are reported or its lines are read.
 */
function isSearchablePath(options: {
  /**
   * Path as the sandbox printed it.
   */
  relativePath: string;
}): boolean {
  if (options.relativePath.length === 0) return false;
  if (options.relativePath.startsWith('/')) return false;
  const segments = options.relativePath.split('/');
  if (segments.includes('..')) return false;
  return !EXCLUDED_DIRECTORIES.some(name => segments.includes(name));
}

/**
 * Parses the output of a recursive search, which the sandbox frames as
 * `path\0 line:text … \0` per file.
 *
 * A filename can contain `:`, so the file name is delimited by a NUL byte and
 * the matches of a file follow as `line:text`. Blocks that do not parse are
 * skipped, as are lines that are no matches (e.g. `Binary file ... matches`).
 */
function parseRecursiveOutput(options: {
  /**
   * Framed output of the search.
   */
  output: string;
}): { matches: GrepMatch[]; files: number } {
  const matches: GrepMatch[] = [];
  let files = 0;
  const blocks = options.output.split('\0');
  for (let index = 0; index + 1 < blocks.length; index += 2) {
    const relativePath = (blocks[index] ?? '').replace(/^(\.\/)+/, '');
    if (!isSearchablePath({ relativePath })) continue;
    files += 1;
    // One match at a time: a spread of a very large array can overflow the
    // stack when the search returns many lines.
    for (const match of parseMatchLines({
      output: blocks[index + 1] ?? '',
      relativePath,
    })) {
      matches.push(match);
    }
  }
  return { matches, files };
}

/**
 * Files that one recursive search may open, so a search that matches many files
 * does not build an oversized sandbox command.
 */
const MAX_SEARCH_FILES = 250;

/**
 * Bytes of the rendered result that the host holds before it truncates. Four
 * times Pi's display limit leaves room for the truncation notice to describe
 * the same output, and a large `limit` or `context` cannot grow it further.
 */
const MAX_RENDERED_BYTES = 4 * DEFAULT_MAX_BYTES;

/**
 * Merges line ranges that overlap or touch, sorted by their first line, so one
 * command can print all of them without printing a line twice.
 */
function mergeLineRanges(options: {
  /**
   * Ranges to merge.
   */
  ranges: Array<{ start: number; end: number }>;
}): Array<{ start: number; end: number }> {
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of [...options.ranges].sort(
    (left, right) => left.start - right.start,
  )) {
    const last = merged[merged.length - 1];
    if (last != null && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Reads line ranges of a file in the sandbox, at most `maxBytes` of its lines,
 * so a matching file is never transferred as a whole.
 *
 * `awk` prints each line with its number, so the lines can be put back where
 * they were found, and `head -c` stops a range that holds very long lines.
 * Resolves to `null` when the file cannot be read.
 */
async function readLineRanges(options: {
  /**
   * Sandbox session to read from.
   */
  session: SandboxSession;

  /**
   * Directory that `relativePath` resolves against.
   */
  directory: string;

  /**
   * Path of the file, relative to `directory`.
   */
  relativePath: string;

  /**
   * Merged ranges of one-based line numbers to read.
   */
  ranges: Array<{ start: number; end: number }>;

  /**
   * Bytes of text to read at most.
   */
  maxBytes: number;

  /**
   * Aborts the read.
   */
  abortSignal?: AbortSignal;
}): Promise<{
  /**
   * Lines by their one-based number.
   */
  lines: Map<number, string>;

  /**
   * Bytes of text that were read.
   */
  bytes: number;

  /**
   * Whether reading stopped at `maxBytes`.
   */
  truncated: boolean;
} | null> {
  const { session, directory, relativePath, ranges, maxBytes, abortSignal } =
    options;
  const conditions = ranges
    .map(({ start, end }) => `NR>=${start} && NR<=${end}`)
    .join(' || ');
  const lastLine = ranges[ranges.length - 1]?.end ?? 0;
  /*
   * The absolute path keeps a name with `=` from being read as an assignment,
   * `pipefail` reports an unreadable file instead of the exit code of `head`,
   * and the lines are cut and the scan stopped early so that a file with very
   * long lines or with lines after the last range stays cheap.
   */
  const command = `set -o pipefail; awk '${conditions} { print NR "\\t" substr($0, 1, ${LINE_MAX_CHARS}) } NR > ${lastLine} { exit }' ${shellQuote(path.posix.join(directory, relativePath))} | head -c ${maxBytes + 1}`;

  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await session.run({ command, abortSignal });
  } catch {
    if (abortSignal?.aborted) throw new Error('Operation aborted');
    return null;
  }
  // 141 is `head` closing the pipe after it reached the byte limit. A sandbox
  // whose command runner ignores SIGPIPE reports a write failure instead, so
  // an output past the limit is accepted whatever the exit code.
  if (
    result.exitCode !== 0 &&
    result.exitCode !== 141 &&
    Buffer.byteLength(result.stdout, 'utf-8') <= maxBytes
  ) {
    return null;
  }

  const lines = new Map<number, string>();
  for (const rawLine of result.stdout.split('\n')) {
    const match = /^(\d+)\t(.*)$/s.exec(rawLine);
    if (match == null) continue;
    lines.set(Number.parseInt(match[1] ?? '', 10), match[2] ?? '');
  }
  const bytes = Buffer.byteLength(result.stdout, 'utf-8');
  const truncated = bytes > maxBytes;
  if (truncated && !result.stdout.endsWith('\n')) {
    // The cut split the last line, so it cannot be placed in the file.
    const lastLine = [...lines.keys()].pop();
    if (lastLine != null) lines.delete(lastLine);
  }
  return { lines, bytes, truncated };
}

/**
 * Searches the sandbox like Pi's grep tool searches the local file system.
 */
async function executeGrep(options: {
  /**
   * Sandbox session to search.
   */
  session: SandboxSession;

  /**
   * Working directory that relative paths resolve against.
   */
  workDir: string;

  /**
   * Tool input given by the model.
   */
  input: GrepToolInput;

  /**
   * Aborts the search.
   */
  abortSignal?: AbortSignal;
}): Promise<AgentToolResult<GrepToolDetails | undefined>> {
  const { session, workDir, input, abortSignal } = options;
  if (abortSignal?.aborted) throw new Error('Operation aborted');

  const searchPath = path.posix.resolve(workDir, input.path || '.');
  const stat = await session.stat({ path: searchPath, abortSignal });
  if (stat == null) throw new Error(`Path not found: ${searchPath}`);
  const isDirectory = stat.type === 'directory';
  const directory = isDirectory ? searchPath : path.posix.dirname(searchPath);
  const fileName = path.posix.basename(searchPath);
  const requestContext = Number(input.context ?? 0);
  const contextValue = Number.isFinite(requestContext)
    ? Math.min(Math.max(0, Math.floor(requestContext)), Number.MAX_SAFE_INTEGER)
    : 0;
  /*
   * `limit` reaches `head -n` as a number, so it stays below the point where
   * JavaScript prints exponent notation that `head` rejects.
   */
  const requestLimit = Number(input.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requestLimit)
    ? Math.min(Math.max(1, Math.floor(requestLimit)), Number.MAX_SAFE_INTEGER)
    : DEFAULT_LIMIT;

  const matchFlags = [
    '-n',
    ...(input.ignoreCase ? ['-i'] : []),
    input.literal ? '-F' : '-E',
  ];
  const fileFlags = [
    '-r',
    '-l',
    ...EXCLUDED_DIRECTORIES.map(name => `--exclude-dir=${name}`),
    ...(input.glob ? [`--include=${path.posix.basename(input.glob)}`] : []),
    ...(input.ignoreCase ? ['-i'] : []),
    input.literal ? '-F' : '-E',
  ];
  const quotedFlags = (flags: string[]) => flags.map(shellQuote).join(' ');
  const quotedPattern = shellQuote(input.pattern);
  const fileLimit = Math.min(limit, MAX_SEARCH_FILES);
  /*
   * A filename can contain `:`, so a recursive search cannot report
   * `path:line:text`: the files that match are listed first and each one is
   * searched on its own, framed by NUL bytes around `path` and its matches.
   * The per-line cut and the byte cap keep the transfer bounded. The per-file
   * search runs in a subshell because just-bash skips loop iterations when the
   * body pipes a command directly.
   */
  /*
   * A search ends with a marker that neither a file name nor a match line can
   * produce, because both are stripped of NUL bytes. The marker proves that the
   * byte cap did not cut the output, whatever the sandbox counts with `-c`.
   */
  const endMarkerCommand = `printf '\\0/pi-grep-complete\\0'`;
  // The marker is a pipeline stage of its own so that `pipefail` still reports
  // the status of the search, not the status of the `printf`.
  const command = isDirectory
    ? `set -o pipefail; cd ${shellQuote(directory)} && grep ${quotedFlags(fileFlags)} -e ${quotedPattern} . | head -n ${fileLimit + 1} | while IFS= read -r file; do printf '%s\\0' "./$file"; ( grep ${quotedFlags(matchFlags)} -e ${quotedPattern} "./$file" | head -n ${limit} | awk '{ gsub("\\000", ""); print substr($0, 1, ${LINE_MAX_CHARS}) }' ); printf '\\0'; done | { cat; ${endMarkerCommand}; } | head -c ${MATCH_MAX_BYTES + 1}`
    : `set -o pipefail; cd ${shellQuote(directory)} && grep ${quotedFlags(matchFlags)} -e ${quotedPattern} ${shellQuote(`./${fileName}`)} | head -n ${limit} | awk '{ gsub("\\000", ""); print substr($0, 1, ${LINE_MAX_CHARS}) }' | { cat; ${endMarkerCommand}; } | head -c ${MATCH_MAX_BYTES + 1}`;
  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await session.run({ command, abortSignal });
  } catch (error) {
    if (abortSignal?.aborted) throw new Error('Operation aborted');
    throw error;
  }
  if (abortSignal?.aborted) throw new Error('Operation aborted');

  const parsed = isDirectory
    ? parseRecursiveOutput({ output: result.stdout })
    : undefined;
  const matches = (
    parsed?.matches ??
    parseMatchLines({ output: result.stdout, relativePath: fileName })
  ).slice(0, limit);
  // Only a search that reached its end printed the marker before the byte cap.
  const matchesTruncated = !result.stdout.endsWith(END_MARKER);
  const listedFiles = parsed?.files ?? 0;
  // The sandbox can only say that it listed more files than the cap, so the
  // notice is only accurate when the matches themselves are below the limit.
  const filesTruncated = listedFiles > fileLimit && matches.length < limit;
  const missingMatchesNotice =
    'Some matches may be missing, the output reached its limit';
  /*
   * grep exits with 1 when nothing matched, and with 141 when `head` closed
   * the pipe after reaching the limit. A recursive search that hit an
   * unreadable entry exits with 2 but still reports the readable matches.
   */
  if (
    result.exitCode !== 0 &&
    result.exitCode !== 1 &&
    result.exitCode !== 141 &&
    matches.length === 0
  ) {
    throw new Error(
      result.stderr.trim() || `grep exited with code ${result.exitCode}`,
    );
  }
  /*
   * A search that succeeded frames every file with NUL bytes. Without one, the
   * sandbox did not deliver that framing, and the empty parse must not be
   * reported as a complete answer.
   */
  if (
    isDirectory &&
    (result.exitCode === 0 || result.exitCode === 141) &&
    !result.stdout.includes('\0')
  ) {
    throw new Error(
      'The sandbox did not preserve the NUL framing of the grep output',
    );
  }
  if (matches.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: filesTruncated
            ? `No matches found\n\n[${missingMatchesNotice}]`
            : 'No matches found',
        },
      ],
      details: undefined,
    };
  }

  let linesTruncated = false;
  const formatLine = (text: string) => {
    const truncated = truncateLine(
      text.replace(/\r\n/g, '\n').replace(/\r/g, '').replace(/\n$/, ''),
      GREP_MAX_LINE_LENGTH,
    );
    if (truncated.wasTruncated) linesTruncated = true;
    return truncated.text;
  };
  /*
   * Context lines are read from the sandbox per file, bounded by
   * `CONTEXT_MAX_BYTES` and `CONTEXT_BUDGET_BYTES`, so a match in a file that
   * is far larger than the host should hold never loads that file.
   */
  const contextByFile = new Map<string, Map<number, string> | null>();
  let contextTruncated = false;
  if (contextValue > 0) {
    const rangesByFile = new Map<
      string,
      Array<{ start: number; end: number }>
    >();
    for (const match of matches) {
      const ranges = rangesByFile.get(match.relativePath) ?? [];
      ranges.push({
        start: Math.max(1, match.lineNumber - contextValue),
        end: match.lineNumber + contextValue,
      });
      rangesByFile.set(match.relativePath, ranges);
    }

    let budgetLeft = CONTEXT_BUDGET_BYTES;
    for (const [relativePath, ranges] of rangesByFile) {
      if (budgetLeft <= 0) {
        contextTruncated = true;
        break;
      }
      const merged = mergeLineRanges({ ranges });
      const limited = merged.slice(0, CONTEXT_MAX_RANGES);
      if (limited.length < merged.length) contextTruncated = true;
      const context = await readLineRanges({
        session,
        directory,
        relativePath,
        ranges: limited,
        maxBytes: Math.min(CONTEXT_MAX_BYTES, budgetLeft),
        abortSignal,
      });
      if (context == null) {
        contextByFile.set(relativePath, null);
        continue;
      }
      budgetLeft -= context.bytes;
      if (context.truncated) contextTruncated = true;
      contextByFile.set(relativePath, context.lines);
    }
  }

  const outputLines: string[] = [];
  let renderedBytes = 0;
  /*
   * Lines that the sandbox returned for each file, sorted once, so a match
   * finds its window by binary search: walking the whole map for every match
   * would be quadratic in the size of the result.
   */
  const sortedContextByFile = new Map<
    string,
    Array<{ line: number; text: string }>
  >();
  for (const [relativePath, lines] of contextByFile) {
    if (lines == null) continue;
    sortedContextByFile.set(
      relativePath,
      [...lines]
        .map(([line, text]) => ({ line, text }))
        .sort((left, right) => left.line - right.line),
    );
  }

  const pushLine = (line: string) => {
    outputLines.push(line);
    renderedBytes += Buffer.byteLength(line, 'utf-8') + 1;
    return renderedBytes < MAX_RENDERED_BYTES;
  };

  for (const match of matches) {
    if (renderedBytes >= MAX_RENDERED_BYTES) break;
    if (contextValue === 0) {
      pushLine(
        `${match.relativePath}:${match.lineNumber}: ${formatLine(match.lineText)}`,
      );
      continue;
    }
    const context = contextByFile.get(match.relativePath);
    if (context === null) {
      pushLine(
        `${match.relativePath}:${match.lineNumber}: (unable to read file)`,
      );
      continue;
    }
    const start = Math.max(1, match.lineNumber - contextValue);
    const end = match.lineNumber + contextValue;
    const entries = sortedContextByFile.get(match.relativePath) ?? [];
    // First returned line that is inside the window.
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((entries[middle]?.line ?? 0) < start) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    /*
     * Render the lines that the sandbox returned for this window instead of
     * every number from `start` to `end`: the range can be huge and a forged
     * line number cannot make this loop.
     */
    const window: Array<{ line: number; text: string; match: boolean }> = [];
    for (let index = low; index < entries.length; index++) {
      const entry = entries[index];
      if (entry == null || entry.line > end) break;
      if (entry.line === match.lineNumber) continue;
      window.push({ line: entry.line, text: entry.text, match: false });
    }
    // The matching line comes from the search itself, so it is complete even
    // where the context read stopped at its byte limit.
    window.push({ line: match.lineNumber, text: match.lineText, match: true });
    window.sort((left, right) => left.line - right.line);
    for (const entry of window) {
      const line = entry.match
        ? `${match.relativePath}:${entry.line}: ${formatLine(entry.text)}`
        : `${match.relativePath}-${entry.line}- ${formatLine(entry.text)}`;
      if (!pushLine(line)) break;
    }
  }

  const truncation = truncateHead(outputLines.join('\n'), {
    maxLines: Number.MAX_SAFE_INTEGER,
  });
  let output = truncation.content;
  const details: GrepToolDetails = {};
  const notices: string[] = [];
  if (matches.length >= limit) {
    notices.push(
      `${limit} matches limit reached. Use limit=${limit * 2} for more, or refine pattern`,
    );
    details.matchLimitReached = limit;
  }
  if (truncation.truncated) {
    notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
    details.truncation = truncation;
  }
  if (linesTruncated) {
    notices.push(
      `Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`,
    );
    details.linesTruncated = true;
  }
  if (contextTruncated) {
    notices.push('Some context lines omitted for large files');
  }
  if (matchesTruncated || filesTruncated) {
    notices.push(missingMatchesNotice);
  }
  if (notices.length > 0) output += `\n\n[${notices.join('. ')}]`;

  return {
    content: [{ type: 'text', text: output }],
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

/**
 * Creates Pi's grep tool, searching a sandbox.
 *
 * The tool is Pi's own grep tool, but since Pi's implementation runs ripgrep
 * on the local file system, its execution runs `grep` in the sandbox
 * instead: recursively for a directory (skipping `.git` and `node_modules`),
 * as an extended regular expression or a literal string, and limited to `limit`
 * matches (100 by default). `glob` filters file names. A recursive search lists
 * the matching files and searches each of them on its own, framed by NUL bytes
 * around its path and its matches, because a file name may contain the `:` that
 * `grep` puts between path, line and text; NUL bytes in a matching line are
 * removed in the sandbox, so file content cannot forge that frame. Matches are
 * formatted like Pi's
 * (`path:line: text`, with `path-line- text` context lines), long lines are
 * truncated, the output is cut at Pi's byte limit, and Pi's notices are appended
 * when a limit was reached. Context lines are selected in the sandbox, bounded
 * in bytes, and rendered from the lines that came back, so a match in a file
 * that is far larger than the host should hold does not read that file.
 *
 * Throws `Path not found` for a missing path, `Operation aborted` when the
 * signal aborts, and the search's error output when it fails.
 */
export function createPiGrepTool(options: {
  /**
   * Sandbox session to search.
   */
  session: SandboxSession;

  /**
   * Working directory that relative paths resolve against.
   */
  workDir: string;
}): ReturnType<typeof createGrepTool> {
  const { session, workDir } = options;
  return {
    ...createGrepTool(workDir),
    execute: (_toolCallId, input, abortSignal) =>
      executeGrep({ session, workDir, input, abortSignal }),
  };
}
