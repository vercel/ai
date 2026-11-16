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
 * Bytes of matching lines that one search may transfer, so a matching line
 * that is far longer than the result shows cannot fill the host's memory. The
 * lines are truncated for display anyway.
 */
const MATCH_MAX_BYTES = 1024 * 1024;

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
 * Parses the output lines of `grep -n`: `path:line:text` for a recursive
 * search and `line:text` for a single file. Lines that are no matches (e.g.
 * `Binary file ... matches`) are skipped.
 */
function parseGrepOutput(options: {
  /**
   * Standard output of the search.
   */
  output: string;

  /**
   * Path to report for a single-file search, which prints no file names.
   */
  singleFile?: string;
}): GrepMatch[] {
  const matches: GrepMatch[] = [];
  for (const line of options.output.split('\n')) {
    if (options.singleFile != null) {
      const match = /^(\d+):(.*)$/s.exec(line);
      if (match == null) continue;
      matches.push({
        relativePath: options.singleFile,
        lineNumber: Number.parseInt(match[1], 10),
        lineText: match[2],
      });
      continue;
    }
    const match = /^(.+?):(\d+):(.*)$/s.exec(line);
    if (match == null) continue;
    matches.push({
      relativePath: match[1].replace(/^\.\//, ''),
      lineNumber: Number.parseInt(match[2], 10),
      lineText: match[3],
    });
  }
  return matches;
}

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
  const command = `cd ${shellQuote(directory)} && awk '${conditions} { print NR "\\t" $0 }' ${shellQuote(relativePath)} | head -c ${maxBytes + 1}`;

  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await session.run({ command, abortSignal });
  } catch {
    if (abortSignal?.aborted) throw new Error('Operation aborted');
    return null;
  }
  if (result.exitCode !== 0) return null;

  const lines = new Map<number, string>();
  for (const rawLine of result.stdout.split('\n')) {
    const match = /^(\d+)\t(.*)$/s.exec(rawLine);
    if (match == null) continue;
    lines.set(Number.parseInt(match[1] ?? '', 10), match[2] ?? '');
  }
  const bytes = Buffer.byteLength(result.stdout, 'utf-8');
  // A line that `head -c` cut keeps the beginning of its text, which is what
  // the result shows, and a cut inside the line number cannot match.
  return { lines, bytes, truncated: bytes > maxBytes };
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
  const contextValue = input.context && input.context > 0 ? input.context : 0;
  const limit = Math.max(1, input.limit ?? DEFAULT_LIMIT);

  const flags = [
    '-n',
    ...(isDirectory
      ? [
          '-r',
          ...EXCLUDED_DIRECTORIES.map(name => `--exclude-dir=${name}`),
          ...(input.glob
            ? [`--include=${path.posix.basename(input.glob)}`]
            : []),
        ]
      : []),
    ...(input.ignoreCase ? ['-i'] : []),
    input.literal ? '-F' : '-E',
  ];
  const target = isDirectory ? '.' : `./${fileName}`;
  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await session.run({
      command: `set -o pipefail; cd ${shellQuote(directory)} && grep ${flags.map(shellQuote).join(' ')} -e ${shellQuote(input.pattern)} ${shellQuote(target)} | head -n ${limit} | head -c ${MATCH_MAX_BYTES}`,
      abortSignal,
    });
  } catch (error) {
    if (abortSignal?.aborted) throw new Error('Operation aborted');
    throw error;
  }
  if (abortSignal?.aborted) throw new Error('Operation aborted');

  const matches = parseGrepOutput({
    output: result.stdout,
    singleFile: isDirectory ? undefined : fileName,
  }).slice(0, limit);
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
  if (matches.length === 0) {
    return {
      content: [{ type: 'text', text: 'No matches found' }],
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
      const context = await readLineRanges({
        session,
        directory,
        relativePath,
        ranges: mergeLineRanges({ ranges }),
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
  for (const match of matches) {
    if (contextValue === 0) {
      outputLines.push(
        `${match.relativePath}:${match.lineNumber}: ${formatLine(match.lineText)}`,
      );
      continue;
    }
    const context = contextByFile.get(match.relativePath);
    if (context === null) {
      outputLines.push(
        `${match.relativePath}:${match.lineNumber}: (unable to read file)`,
      );
      continue;
    }
    const start = Math.max(1, match.lineNumber - contextValue);
    const end = match.lineNumber + contextValue;
    for (let current = start; current <= end; current++) {
      const contextText = context?.get(current);
      if (contextText == null && current !== match.lineNumber) continue;
      const text = formatLine(contextText ?? match.lineText);
      outputLines.push(
        current === match.lineNumber
          ? `${match.relativePath}:${current}: ${text}`
          : `${match.relativePath}-${current}- ${text}`,
      );
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
 * as an extended regular expression or a literal string, and limited to `limit` matches (100 by default). `glob`
 * filters file names. Matches are formatted like Pi's (`path:line: text`,
 * with `path-line- text` context lines), long lines are truncated, the output
 * is cut at Pi's byte limit, and Pi's notices are appended when a limit was
 * reached. Context lines are selected in the sandbox and bounded in bytes, so a
 * match in a file that is far larger than the host should hold does not read
 * that file.
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
