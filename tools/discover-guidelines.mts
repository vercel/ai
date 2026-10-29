#!/usr/bin/env node

import {
  getApplicableGuidelines,
  getInputFiles,
} from './verifiers/internal/discovery.ts';

try {
  const inputFiles = getInputFiles();
  const guidelines = await getApplicableGuidelines(inputFiles);
  if (guidelines.length === 0) {
    console.log('No applicable guidelines found.');
  } else {
    console.log('Ensure you have read the following guidelines:');
    for (const { guidelineFile } of guidelines) {
      console.log(`- \`${guidelineFile}\``);
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
