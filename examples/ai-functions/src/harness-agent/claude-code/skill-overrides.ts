import { run } from '../../lib/run';
import { createClaudeCode } from './_create';

run(async () => {
  const harness = createClaudeCode({
    settings: {
      skillOverrides: {
        'update-config': 'off',
        'fewer-permission-prompts': 'off',
        'keybindings-help': 'off',
        init: 'off',
      },
    },
  });

  console.log(`Configured ${harness.harnessId} skill overrides.`);
});
