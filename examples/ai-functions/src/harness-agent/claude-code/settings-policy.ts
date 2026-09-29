import { run } from '../../lib/run';
import { createClaudeCode } from './_create';

run(async () => {
  const harness = createClaudeCode({
    // Disable user, project, and local settings files for an isolated run.
    settingSources: [],
    // Apply invocation-specific settings at Claude Code's flag-settings tier.
    settings: {
      permissions: {
        deny: ['WebFetch(*)'],
      },
    },
    // Apply restrictive policy supplied by the embedding application.
    managedSettings: {
      permissions: {
        deny: ['Bash(curl *)'],
      },
    },
  });

  console.log(`Configured ${harness.harnessId} settings policy.`);
});
