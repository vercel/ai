#!/usr/bin/env node

import {
  runVerifier,
  type FileVerifierViolation,
} from '../../tools/verifiers/api.ts';
import { readTextFile } from '../../tools/verifiers/utils.ts';

type Heading = {
  level: number;
  lineIndex: number;
  text: string;
};

type CodeBlock = {
  closed: boolean;
  endLineIndex: number;
  fenceCharacter: string;
  fenceLength: number;
  language: string;
  lineIndex: number;
  lines: string[];
};

await runVerifier(async ({ files, reportViolation }) => {
  for (const file of files) {
    validateReadme({
      file,
      source: await readTextFile(file),
      reportViolation,
    });
  }
});

function validateReadme({
  file,
  source,
  reportViolation,
}: {
  file: string;
  source: string;
  reportViolation: (violation: FileVerifierViolation) => void;
}): void {
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
    reportViolation({ file, violationCode: 'README-1' });
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
    reportViolation({ file, violationCode: 'README-3' });
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
    reportViolation({ file, violationCode: 'README-3' });
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
      reportViolation({ file, violationCode: 'README-2' });
    } else if (countSentences({ text: descriptionParagraph }) > 2) {
      reportViolation({ file, violationCode: 'README-2' });
    }

    if (!hasOnlyDescriptionAndOptionalNote) {
      reportViolation({ file, violationCode: 'README-2' });
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
      reportViolation({ file, violationCode: 'README-3' });
    } else {
      const [setupCodeBlock] = setupCodeBlocks;
      const commandLines = setupCodeBlock.lines
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (!['bash', 'sh', 'shell'].includes(setupCodeBlock.language)) {
        reportViolation({ file, violationCode: 'README-3' });
      }
      if (
        !setupCodeBlock.closed ||
        commandLines.length !== 1 ||
        !/^npm i\s+\S+(?:\s+\S+)*$/.test(commandLines[0] ?? '')
      ) {
        reportViolation({ file, violationCode: 'README-3' });
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
      reportViolation({ file, violationCode: 'README-3' });
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
      reportViolation({ file, violationCode: 'README-3' });
    } else {
      const [usageCodeBlock] = usageCodeBlocks;
      const isTypeScriptExample =
        ['ts', 'tsx', 'typescript'].includes(usageCodeBlock.language) ||
        (usageCodeBlock.language === 'svelte' &&
          /<script\b[^>]*\blang\s*=\s*(["'])ts\1/i.test(
            usageCodeBlock.lines.join('\n'),
          ));

      if (!usageCodeBlock.closed || !isTypeScriptExample) {
        reportViolation({ file, violationCode: 'README-3' });
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
      reportViolation({ file, violationCode: 'README-3' });
    }

    if (
      hasNonCodeContent({
        codeBlocks,
        endLineIndex: lastParagraph?.startLineIndex ?? usageEndLineIndex,
        lines,
        startLineIndex: usageHeading.lineIndex + 1,
      })
    ) {
      reportViolation({ file, violationCode: 'README-3' });
    }
  }

  for (const codeBlock of codeBlocks) {
    if (!codeBlock.closed) {
      reportViolation({ file, violationCode: 'README-3' });
    }
  }

  if (codeBlocks.length !== 2 + skillCodeBlocks.length) {
    reportViolation({ file, violationCode: 'README-3' });
  }
}

function parseMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const headings: Heading[] = [];
  const codeBlocks: CodeBlock[] = [];
  let openCodeBlock: CodeBlock | undefined;

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
        text: (heading[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim(),
      });
    }
  }

  return { codeBlocks, headings, lines };
}

function getSectionCodeBlocks({
  codeBlocks,
  endLineIndex,
  startLineIndex,
}: {
  codeBlocks: CodeBlock[];
  endLineIndex: number;
  startLineIndex: number;
}) {
  return codeBlocks.filter(
    codeBlock =>
      codeBlock.lineIndex > startLineIndex &&
      codeBlock.lineIndex < endLineIndex,
  );
}

function getSectionEndLine({
  heading,
  headings,
  lineCount,
}: {
  heading: Heading;
  headings: Heading[];
  lineCount: number;
}) {
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
}: {
  codeBlocks: CodeBlock[];
  endLineIndex: number;
  lines: string[];
  startLineIndex: number;
}) {
  for (let lineIndex = startLineIndex; lineIndex < endLineIndex; lineIndex++) {
    if (
      lines[lineIndex]?.trim().length > 0 &&
      !isInsideCodeBlock({ codeBlocks, lineIndex })
    ) {
      return true;
    }
  }
  return false;
}

function getParagraphs({
  lines,
  startLineIndex,
  endLineIndex,
}: {
  lines: string[];
  startLineIndex: number;
  endLineIndex: number;
}) {
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

function isOptionalNoteParagraph(text: string) {
  return /^(?:->\s+\*\*Note\*\*:|>\s+\*\*(?:Note|Deploying to Vercel\?)\*\*)/i.test(
    text,
  );
}

function countSentences({ text }: { text: string }) {
  const normalizedText = text
    .replace(/`[^`]*`/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\b(?:e\.g|i\.e)\./gi, '');
  const sentenceEndings =
    normalizedText.match(/[.!?](?=(?:["')\]]*)?(?:\s|$))/g) ?? [];

  return Math.max(1, sentenceEndings.length);
}

function isInsideCodeBlock({
  codeBlocks,
  lineIndex,
}: {
  codeBlocks: CodeBlock[];
  lineIndex: number;
}) {
  return codeBlocks.some(
    codeBlock =>
      lineIndex >= codeBlock.lineIndex && lineIndex <= codeBlock.endLineIndex,
  );
}

function getLastParagraph({ lines }: { lines: string[] }) {
  let endLineIndex = lines.length - 1;
  while (endLineIndex >= 0 && lines[endLineIndex].trim().length === 0) {
    endLineIndex--;
  }
  if (endLineIndex < 0) return undefined;

  let startLineIndex = endLineIndex;
  while (startLineIndex > 0 && lines[startLineIndex - 1].trim().length > 0) {
    startLineIndex--;
  }

  return {
    startLineIndex,
    text: lines.slice(startLineIndex, endLineIndex + 1).join(' '),
  };
}
