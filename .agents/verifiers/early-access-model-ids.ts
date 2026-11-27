#!/usr/bin/env node

import { runVerifier } from '../../tools/verifiers/api.ts';
import { readTextFile } from '../../tools/verifiers/utils.ts';

/*
 * Matches a lowercase identifier with an `eap` segment after a hyphen, such as
 * `gemini-4-hydrogen-eap`. Prose such as "EAP" and words such as "heap" do not
 * match.
 */
const earlyAccessModelIdPattern = /[a-z0-9]-eap(?![A-Za-z0-9])/;

await runVerifier(async ({ files, reportViolation }) => {
  for (const file of files) {
    if (earlyAccessModelIdPattern.test(await readTextFile(file))) {
      reportViolation({ file, violationCode: 'EAM-1' });
    }
  }
});
