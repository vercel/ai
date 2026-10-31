import { basename, extname } from 'node:path';

export { fileExists, readTextFile } from './internal/file.ts';
export { logError, logMessage } from './internal/output.ts';

export function getGuidelineFile() {
  return `.agents/guidelines/${getInputFileBasename()}.md`;
}

export function getVerifierFile() {
  return `.agents/verifiers/${getInputFileBasename()}.md`;
}

function getInputFileBasename() {
  const verifierPath = process.argv[1];
  if (verifierPath == null) {
    throw new Error('Cannot determine the executable verifier file.');
  }

  return basename(verifierPath, extname(verifierPath));
}
