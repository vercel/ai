import path from 'node:path';
import {
  safeParseJSON,
  type Experimental_SandboxSession,
} from '@ai-sdk/provider-utils';
import { shellQuote } from './shell-quote';

const INSTRUCTIONS_METADATA_VERSION = 1;

export type WriteInstructionsOptions = {
  sandbox: Experimental_SandboxSession;
  homePath: string;
  instructionsFile: string;
  instructions?: string;
  abortSignal?: AbortSignal;
};

export type WriteInstructionsResult = {
  changed: boolean;
  filePath: string;
};

type InstructionsMetadata = {
  readonly version: typeof INSTRUCTIONS_METADATA_VERSION;
  readonly originalContent: string | null;
  readonly instructions: string;
  readonly appliedContent: string;
};

export async function writeInstructions({
  sandbox,
  homePath,
  instructionsFile,
  instructions,
  abortSignal,
}: WriteInstructionsOptions): Promise<WriteInstructionsResult> {
  const { targetPath, metadataPath } = resolveInstructionsFilePath({
    homePath,
    instructionsFile,
  });

  const hasInstructions =
    typeof instructions === 'string' && instructions.trim().length > 0;
  const trimmedInstructions = hasInstructions ? instructions.trim() : '';

  const currentDiskContent = await sandbox.readTextFile({
    path: targetPath,
    abortSignal,
  });
  const existingMetadata = await readInstructionsMetadata({
    sandbox,
    metadataPath,
    abortSignal,
  });

  if (hasInstructions) {
    const originalContent = deriveOriginalContent({
      currentDiskContent,
      existingMetadata,
    });

    const targetContent =
      originalContent != null && originalContent.trim().length > 0
        ? `${originalContent.replace(/\n+$/, '')}\n\n${trimmedInstructions}\n`
        : `${trimmedInstructions}\n`;

    if (
      currentDiskContent === targetContent &&
      existingMetadata != null &&
      existingMetadata.instructions === trimmedInstructions &&
      existingMetadata.originalContent === originalContent
    ) {
      return { changed: false, filePath: targetPath };
    }

    await sandbox.writeTextFile({
      path: targetPath,
      content: targetContent,
      abortSignal,
    });

    await writeInstructionsMetadata({
      sandbox,
      metadataPath,
      metadata: {
        version: INSTRUCTIONS_METADATA_VERSION,
        originalContent,
        instructions: trimmedInstructions,
        appliedContent: targetContent,
      },
      abortSignal,
    });

    return { changed: true, filePath: targetPath };
  }

  if (existingMetadata == null) {
    return { changed: false, filePath: targetPath };
  }

  const restoredContent = deriveRestoredContent({
    currentDiskContent,
    existingMetadata,
  });

  if (restoredContent != null) {
    const contentToWrite = `${restoredContent.replace(/\n+$/, '')}\n`;
    await sandbox.writeTextFile({
      path: targetPath,
      content: contentToWrite,
      abortSignal,
    });
  } else {
    await removeTargetFile({
      sandbox,
      targetPath,
      abortSignal,
    });
  }

  await removeMetadataFile({
    sandbox,
    metadataPath,
    abortSignal,
  });

  return { changed: true, filePath: targetPath };
}

function deriveOriginalContent({
  currentDiskContent,
  existingMetadata,
}: {
  currentDiskContent: string | null;
  existingMetadata: InstructionsMetadata | undefined;
}): string | null {
  if (existingMetadata == null) {
    return currentDiskContent;
  }
  if (currentDiskContent == null) {
    return existingMetadata.originalContent;
  }
  if (currentDiskContent === existingMetadata.appliedContent) {
    return existingMetadata.originalContent;
  }
  const trimmedDisk = currentDiskContent.replace(/\n+$/, '');
  const expectedSuffix = `\n\n${existingMetadata.instructions}`;
  if (trimmedDisk.endsWith(expectedSuffix)) {
    const userBase = trimmedDisk.slice(0, -expectedSuffix.length);
    return userBase.length > 0 ? userBase : null;
  }
  if (trimmedDisk === existingMetadata.instructions) {
    return null;
  }
  return existingMetadata.originalContent ?? currentDiskContent;
}

function deriveRestoredContent({
  currentDiskContent,
  existingMetadata,
}: {
  currentDiskContent: string | null;
  existingMetadata: InstructionsMetadata;
}): string | null {
  if (currentDiskContent == null) {
    return null;
  }
  if (currentDiskContent === existingMetadata.appliedContent) {
    return existingMetadata.originalContent != null &&
      existingMetadata.originalContent.trim().length > 0
      ? existingMetadata.originalContent
      : null;
  }
  const trimmedDisk = currentDiskContent.replace(/\n+$/, '');
  const expectedSuffix = `\n\n${existingMetadata.instructions}`;
  if (trimmedDisk.endsWith(expectedSuffix)) {
    const userBase = trimmedDisk.slice(0, -expectedSuffix.length);
    return userBase.length > 0 ? userBase : null;
  }
  if (trimmedDisk === existingMetadata.instructions) {
    return null;
  }
  return currentDiskContent;
}

function resolveInstructionsFilePath({
  homePath,
  instructionsFile,
}: {
  homePath: string;
  instructionsFile: string;
}): { targetPath: string; metadataPath: string } {
  if (typeof homePath !== 'string' || homePath.trim().length === 0) {
    throw new Error('Invalid homePath: expected a non-empty string.');
  }
  if (!path.posix.isAbsolute(homePath)) {
    throw new Error(
      `Invalid homePath ${JSON.stringify(homePath)}: expected an absolute POSIX path.`,
    );
  }
  if (
    typeof instructionsFile !== 'string' ||
    instructionsFile.trim().length === 0
  ) {
    throw new Error(
      `Invalid instructionsFile ${JSON.stringify(instructionsFile)}: expected a relative POSIX path without traversal.`,
    );
  }
  const containsTraversal = instructionsFile
    .split(/[\\\/]/)
    .some(segment => segment === '..');
  const normalizedInstructionsFile = path.posix.normalize(
    instructionsFile.trim(),
  );
  const normalizedNoTrailingSlash = normalizedInstructionsFile.replace(
    /\/+$/,
    '',
  );
  if (
    instructionsFile.includes('\\') ||
    path.posix.isAbsolute(instructionsFile) ||
    path.win32.isAbsolute(instructionsFile) ||
    containsTraversal ||
    instructionsFile.endsWith('/') ||
    instructionsFile.endsWith('\\') ||
    instructionsFile.endsWith('/.') ||
    instructionsFile.endsWith('/..') ||
    normalizedNoTrailingSlash === '' ||
    normalizedNoTrailingSlash === '.' ||
    normalizedInstructionsFile.startsWith('../') ||
    normalizedInstructionsFile.includes('/../') ||
    normalizedInstructionsFile.endsWith('/..')
  ) {
    throw new Error(
      `Invalid instructionsFile ${JSON.stringify(instructionsFile)}: expected a relative POSIX path without traversal.`,
    );
  }
  const targetPath = path.posix.join(homePath, normalizedNoTrailingSlash);
  const relative = path.posix.relative(homePath, targetPath);
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.posix.isAbsolute(relative)
  ) {
    throw new Error(
      `Invalid instructionsFile ${JSON.stringify(instructionsFile)}: must be a subpath within homePath ${JSON.stringify(homePath)}.`,
    );
  }

  const dir = path.posix.dirname(targetPath);
  const base = path.posix.basename(targetPath);
  const metadataPath = path.posix.join(
    dir,
    `.${base}.ai-sdk-harness-instructions.json`,
  );

  return { targetPath, metadataPath };
}

async function readInstructionsMetadata({
  sandbox,
  metadataPath,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  metadataPath: string;
  abortSignal?: AbortSignal;
}): Promise<InstructionsMetadata | undefined> {
  const content = await sandbox.readTextFile({
    path: metadataPath,
    abortSignal,
  });
  if (content == null) return undefined;
  const parsed = await safeParseJSON({ text: content });
  if (!parsed.success || !isInstructionsMetadata(parsed.value)) {
    throw new Error(
      `Invalid AI SDK harness instructions metadata: ${metadataPath}`,
    );
  }
  return parsed.value;
}

function isInstructionsMetadata(value: unknown): value is InstructionsMetadata {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === INSTRUCTIONS_METADATA_VERSION &&
    (candidate.originalContent === null ||
      typeof candidate.originalContent === 'string') &&
    typeof candidate.instructions === 'string' &&
    typeof candidate.appliedContent === 'string'
  );
}

async function writeInstructionsMetadata({
  sandbox,
  metadataPath,
  metadata,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  metadataPath: string;
  metadata: InstructionsMetadata;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const temporaryPath = `${metadataPath}.tmp`;
  await sandbox.writeTextFile({
    path: temporaryPath,
    content: `${JSON.stringify(metadata, null, 2)}\n`,
    abortSignal,
  });
  await runSandboxCommand({
    sandbox,
    command: `mv -f ${shellQuote(temporaryPath)} ${shellQuote(metadataPath)}`,
    abortSignal,
    errorMessage: `Failed to update instructions metadata: ${metadataPath}`,
  });
}

async function removeMetadataFile({
  sandbox,
  metadataPath,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  metadataPath: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  await runSandboxCommand({
    sandbox,
    command: `rm -f -- ${shellQuote(metadataPath)}`,
    abortSignal,
    errorMessage: `Failed to remove instructions metadata: ${metadataPath}`,
  });
}

async function removeTargetFile({
  sandbox,
  targetPath,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  targetPath: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  await runSandboxCommand({
    sandbox,
    command: `rm -f -- ${shellQuote(targetPath)}`,
    abortSignal,
    errorMessage: `Failed to remove instructions file: ${targetPath}`,
  });
}

async function runSandboxCommand({
  sandbox,
  command,
  abortSignal,
  errorMessage,
}: {
  sandbox: Experimental_SandboxSession;
  command: string;
  abortSignal?: AbortSignal;
  errorMessage: string;
}): Promise<void> {
  const result = await sandbox.run({ command, abortSignal });
  if (result.exitCode !== 0) {
    throw new Error(
      `${errorMessage} (exit ${result.exitCode})${result.stderr ? `: ${result.stderr}` : ''}`,
    );
  }
}
