#!/usr/bin/env node

import {
  getApplicableGuidelines,
  getInputFiles,
} from './verifiers/internal/discovery.ts';
import { logError, logMessage } from './verifiers/utils.ts';

try {
  if (process.argv.slice(2).includes('--help')) {
    const help = `pnpm discover-guidelines (--paths <string> | --staged | --modified)

Options:

--paths <PATH>  Limit discovery to the given relative path prefix or glob. Multiple usages allowed.
--staged        Limit discovery to the files staged in git.
--modified      Limit discovery to the files modified in git, including untracked files.

Examples:

\`\`\`
# Gets the list of guideline files that apply to the \`harness\` package.
pnpm discover-guidelines --paths packages/harness

# Gets the list of guideline files that apply to any package \`README.md\` and \`tsconfig.json\` files.
pnpm discover-guidelines --paths 'packages/*/README.md' --paths 'packages/*/tsconfig.json'

# Gets the list of guideline files that apply to any files currently staged in git
pnpm discover-guidelines --staged

# Gets the list of guideline files that apply to any modified non-ignored files, whether staged, tracked, or neither
pnpm discover-guidelines --modified
\`\`\`
`;
    console.log(help);
  } else {
    const inputFiles = getInputFiles();
    const guidelines = await getApplicableGuidelines(inputFiles);
    if (guidelines.length === 0) {
      logMessage('No applicable guidelines found.');
    } else {
      logMessage('Ensure you have read the following guidelines:');
      for (const { guidelineFile } of guidelines) {
        logMessage(`- \`${guidelineFile}\``);
      }
    }
  }
} catch (error) {
  logError(error);
  process.exitCode = 1;
}
