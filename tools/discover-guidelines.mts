#!/usr/bin/env node

import {
  getApplicableGuidelines,
  getInputFiles,
} from './verifiers/internal/discovery.ts';
import { logError, logMessage } from './verifiers/utils.ts';

try {
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
} catch (error) {
  logError(error);
  process.exitCode = 1;
}
