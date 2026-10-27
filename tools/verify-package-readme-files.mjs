#!/usr/bin/env node

import { globSync, readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const excludedPackageNames = new Set([
  'ai',
  'codemod',
  'provider-utils',
  'provider',
]);

const packageReadmes = globSync('packages/*/README.md', {
  cwd: repoRoot,
}).sort();

const readmesToVerify = packageReadmes.filter(readmePath => {
  const packageName = basename(dirname(readmePath));
  return !excludedPackageNames.has(packageName);
});

const errors = readmesToVerify.flatMap(readmePath => {
  const filePath = resolve(repoRoot, readmePath);
  return validateReadme({
    file: relative(repoRoot, filePath),
    source: readFileSync(filePath, 'utf8'),
  });
});

if (errors.length > 0) {
  console.error(`\n✖ Found ${errors.length} package README violation(s):\n`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error(
    `\nChecked ${readmesToVerify.length} README files; excluded ${excludedPackageNames.size} known exceptions.\n`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `✓ Verified ${readmesToVerify.length} package README files; excluded ${excludedPackageNames.size} known exceptions.`,
  );
}

function validateReadme({ file, source }) {
  const errors = [];
  const { codeBlocks, headings, lines } = parseMarkdown({ source });
  const h1Headings = headings.filter(heading => heading.level === 1);
  const h2Headings = headings.filter(heading => heading.level === 2);
  const setupHeading = h2Headings.find(heading => heading.text === 'Setup');
  const skillHeading = h2Headings.find(
    heading => heading.text === 'Skill for Coding Agents',
  );
  const usageHeading = h2Headings.find(heading => heading.text === 'Usage');
  const skillCodeBlocks =
    setupHeading != null &&
    usageHeading != null &&
    skillHeading != null &&
    skillHeading.lineIndex > setupHeading.lineIndex &&
    skillHeading.lineIndex < usageHeading.lineIndex
      ? getSectionCodeBlocks({
          codeBlocks,
          endLineIndex: usageHeading.lineIndex,
          startLineIndex: skillHeading.lineIndex,
        })
      : [];

  if (
    h1Headings.length !== 1 ||
    h1Headings[0]?.lineIndex !== 0 ||
    !lines[0]?.startsWith('# AI SDK - ')
  ) {
    errors.push(
      'must have exactly one H1 on the first line beginning "# AI SDK - "',
    );
  }

  const h2Order = h2Headings.map(heading => heading.text);
  const validH2Orders = [
    ['Setup', 'Usage'],
    ['Setup', 'Skill for Coding Agents', 'Usage'],
  ];
  if (
    !validH2Orders.some(
      expectedOrder =>
        h2Order.length === expectedOrder.length &&
        h2Order.every((heading, index) => heading === expectedOrder[index]),
    )
  ) {
    const foundHeadings = h2Headings.map(heading => `## ${heading.text}`);
    errors.push(
      `must have "## Setup" and "## Usage" H2 sections, with optional "## Skill for Coding Agents" between them (found: ${foundHeadings.join(', ') || 'none'})`,
    );
  }

  const skillEndLineIndex =
    skillHeading == null
      ? -1
      : getSectionEndLine({
          heading: skillHeading,
          headings,
          lineCount: lines.length,
        });
  const otherHeadings = headings.filter(
    heading =>
      heading.level > 2 &&
      !(
        skillHeading != null &&
        heading.lineIndex > skillHeading.lineIndex &&
        heading.lineIndex < skillEndLineIndex
      ),
  );
  if (otherHeadings.length > 0) {
    errors.push('must not contain additional heading sections');
  }

  if (h1Headings[0] != null && setupHeading != null) {
    const introductionParagraphs = getParagraphs({
      endLineIndex: setupHeading.lineIndex,
      lines,
      startLineIndex: h1Headings[0].lineIndex + 1,
    });
    const [descriptionParagraph, optionalNoteParagraph] =
      introductionParagraphs;
    const hasDescription =
      descriptionParagraph != null &&
      descriptionParagraph.trim().length > 0 &&
      !isOptionalNoteParagraph(descriptionParagraph);
    const hasOnlyDescriptionAndOptionalNote =
      introductionParagraphs.length === 1 ||
      (introductionParagraphs.length === 2 &&
        isOptionalNoteParagraph(optionalNoteParagraph ?? ''));

    if (!hasDescription) {
      errors.push('must include a description paragraph after the H1');
    } else if (countSentences({ text: descriptionParagraph }) > 2) {
      errors.push('the description paragraph must contain 1–2 sentences');
    }

    if (!hasOnlyDescriptionAndOptionalNote) {
      errors.push(
        'before "## Setup", must contain only the description paragraph and an optional note paragraph',
      );
    }
  }

  if (setupHeading != null && usageHeading != null) {
    const setupEndLineIndex = getSectionEndLine({
      heading: setupHeading,
      headings,
      lineCount: lines.length,
    });
    const setupCodeBlocks = getSectionCodeBlocks({
      codeBlocks,
      endLineIndex: setupEndLineIndex,
      startLineIndex: setupHeading.lineIndex,
    });

    if (setupCodeBlocks.length !== 1) {
      errors.push('the Setup section must contain exactly one fenced command');
    } else {
      const [setupCodeBlock] = setupCodeBlocks;
      const commandLines = setupCodeBlock.lines
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (!['bash', 'sh', 'shell'].includes(setupCodeBlock.language)) {
        errors.push('the Setup command must use a shell code fence');
      }
      if (
        !setupCodeBlock.closed ||
        commandLines.length !== 1 ||
        !/^npm i\s+\S+(?:\s+\S+)*$/.test(commandLines[0] ?? '')
      ) {
        errors.push(
          'the Setup section must contain one fenced, one-line `npm i` command',
        );
      }
    }

    if (
      hasNonCodeContent({
        codeBlocks,
        endLineIndex: setupEndLineIndex,
        lines,
        startLineIndex: setupHeading.lineIndex + 1,
      })
    ) {
      errors.push('the Setup section must not contain additional content');
    }

    const usageEndLineIndex = getSectionEndLine({
      heading: usageHeading,
      headings,
      lineCount: lines.length,
    });
    const usageCodeBlocks = getSectionCodeBlocks({
      codeBlocks,
      endLineIndex: usageEndLineIndex,
      startLineIndex: usageHeading.lineIndex,
    });

    if (usageCodeBlocks.length !== 1) {
      errors.push('the Usage section must contain exactly one fenced example');
    } else {
      const [usageCodeBlock] = usageCodeBlocks;
      const isTypeScriptExample =
        ['ts', 'tsx', 'typescript'].includes(usageCodeBlock.language) ||
        (usageCodeBlock.language === 'svelte' &&
          /<script\b[^>]*\blang\s*=\s*(["'])ts\1/i.test(
            usageCodeBlock.lines.join('\n'),
          ));

      if (!usageCodeBlock.closed || !isTypeScriptExample) {
        errors.push(
          'the Usage section must contain a fenced TypeScript example',
        );
      }
    }

    const lastParagraph = getLastParagraph({ lines });
    const hasDocsLink =
      lastParagraph != null &&
      !isInsideCodeBlock({
        codeBlocks,
        lineIndex: lastParagraph.startLineIndex,
      }) &&
      /\[[^\]]+\]\(<?https:\/\/ai-sdk\.dev\/(?:docs|providers)\/[^)\s>]+>?[^)]*\)/.test(
        lastParagraph.text,
      );

    if (!hasDocsLink) {
      errors.push(
        'the last paragraph must contain a link to https://ai-sdk.dev/docs/... or https://ai-sdk.dev/providers/...',
      );
    }

    if (
      hasNonCodeContent({
        codeBlocks,
        endLineIndex: lastParagraph?.startLineIndex ?? usageEndLineIndex,
        lines,
        startLineIndex: usageHeading.lineIndex + 1,
      })
    ) {
      errors.push('the Usage section must not contain additional content');
    }
  }

  for (const codeBlock of codeBlocks) {
    if (!codeBlock.closed) {
      errors.push('contains an unclosed fenced code block');
      break;
    }
  }

  if (codeBlocks.length !== 2 + skillCodeBlocks.length) {
    errors.push(
      'must contain only the Setup and Usage code blocks, plus any in the optional Skill for Coding Agents section',
    );
  }

  return errors.map(error => `${file}: ${error}`);
}

function parseMarkdown({ source }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const headings = [];
  const codeBlocks = [];
  let openCodeBlock;

  for (const [lineIndex, line] of lines.entries()) {
    if (openCodeBlock != null) {
      const closingFence = line.match(/^ {0,3}(`+|~+)[ \t]*$/)?.[1];
      if (
        closingFence != null &&
        closingFence[0] === openCodeBlock.fenceCharacter &&
        closingFence.length >= openCodeBlock.fenceLength
      ) {
        openCodeBlock.closed = true;
        openCodeBlock.endLineIndex = lineIndex;
        openCodeBlock = undefined;
      } else {
        openCodeBlock.lines.push(line);
      }
      continue;
    }

    const openingFence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (openingFence != null) {
      const [fence, info] = openingFence.slice(1);
      openCodeBlock = {
        closed: false,
        endLineIndex: lines.length,
        fenceCharacter: fence[0],
        fenceLength: fence.length,
        language: info.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? '',
        lineIndex,
        lines: [],
      };
      codeBlocks.push(openCodeBlock);
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/);
    if (heading != null) {
      headings.push({
        level: heading[1].length,
        lineIndex,
        text: (heading[2] ?? '')
          .replace(/[ \t]+#+[ \t]*$/, '')
          .trim(),
      });
    }
  }

  return { codeBlocks, headings, lines };
}

function getSectionCodeBlocks({ codeBlocks, endLineIndex, startLineIndex }) {
  return codeBlocks.filter(
    codeBlock =>
      codeBlock.lineIndex > startLineIndex &&
      codeBlock.lineIndex < endLineIndex,
  );
}

function getSectionEndLine({ heading, headings, lineCount }) {
  return (
    headings.find(
      candidate =>
        candidate.lineIndex > heading.lineIndex && candidate.level <= 2,
    )?.lineIndex ?? lineCount
  );
}

function hasNonCodeContent({
  codeBlocks,
  endLineIndex,
  lines,
  startLineIndex,
}) {
  for (
    let lineIndex = startLineIndex;
    lineIndex < endLineIndex;
    lineIndex++
  ) {
    if (
      lines[lineIndex]?.trim().length > 0 &&
      !isInsideCodeBlock({ codeBlocks, lineIndex })
    ) {
      return true;
    }
  }
  return false;
}

function getParagraphs({ lines, startLineIndex, endLineIndex }) {
  const paragraphs = [];
  let paragraphLines = [];

  for (let lineIndex = startLineIndex; lineIndex < endLineIndex; lineIndex++) {
    const line = lines[lineIndex]?.trim() ?? '';
    if (line.length === 0) {
      if (paragraphLines.length > 0) {
        paragraphs.push(paragraphLines.join(' '));
        paragraphLines = [];
      }
    } else {
      paragraphLines.push(line);
    }
  }

  if (paragraphLines.length > 0) {
    paragraphs.push(paragraphLines.join(' '));
  }

  return paragraphs;
}

function isOptionalNoteParagraph(text) {
  return /^(?:->\s+\*\*Note\*\*:|>\s+\*\*(?:Note|Deploying to Vercel\?)\*\*)/i.test(
    text,
  );
}

function countSentences({ text }) {
  const normalizedText = text
    .replace(/`[^`]*`/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\b(?:e\.g|i\.e)\./gi, '');
  const sentenceEndings =
    normalizedText.match(/[.!?](?=(?:["')\]]*)?(?:\s|$))/g) ?? [];

  return Math.max(1, sentenceEndings.length);
}

function isInsideCodeBlock({ codeBlocks, lineIndex }) {
  return codeBlocks.some(
    codeBlock =>
      lineIndex >= codeBlock.lineIndex && lineIndex <= codeBlock.endLineIndex,
  );
}

function getLastParagraph({ lines }) {
  let endLineIndex = lines.length - 1;
  while (endLineIndex >= 0 && lines[endLineIndex].trim().length === 0) {
    endLineIndex--;
  }
  if (endLineIndex < 0) return undefined;

  let startLineIndex = endLineIndex;
  while (
    startLineIndex > 0 &&
    lines[startLineIndex - 1].trim().length > 0
  ) {
    startLineIndex--;
  }

  return {
    startLineIndex,
    text: lines.slice(startLineIndex, endLineIndex + 1).join(' '),
  };
}
