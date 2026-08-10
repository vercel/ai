import { byteDance } from '@ai-sdk/bytedance';
import { APICallError, experimental_generateVideo as generateVideo } from 'ai';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// Shows how a failed ByteDance video generation surfaces. There are two
// distinct paths, and which one you get depends on when the provider gives up:
//
//   - Rejected at submission -> `APICallError` from the create-task POST. No
//     task exists yet, so there is no task ID. ByteDance validates the model,
//     the parameters, and any asset URLs here, so a bad model ID (below), an
//     unreachable image, or an invalid duration all land in this branch.
//   - Failed after creation  -> the task is created, then reports itself as
//     failed. `doStatus` maps that to `status: 'error'` and core rethrows it.
//     The message carries the task ID and the reason the task reported.
//
// This example uses an unknown model ID, which takes the first path. To reach
// the second, swap in a real model and a prompt the content filter rejects (a
// well-known character or trademark usually does it) — that is accepted at
// submission and fails during generation.
run(async () => {
  try {
    await withSpinner('Generating video (expected to fail)...', () =>
      generateVideo({
        model: byteDance.video('seedance-does-not-exist'),
        prompt: 'A chicken flying into the sunset over a field of daisies.',
        duration: 5,
      }),
    );

    console.log('Generation unexpectedly succeeded.');
  } catch (error) {
    if (APICallError.isInstance(error)) {
      console.log('Rejected at submission, before a task ID was assigned:');
      console.log(`  status:  ${error.statusCode}`);
      console.log(`  message: ${error.message}`);
      return;
    }

    console.log('Task failed after creation:');
    console.log(`  ${(error as Error).message}`);
  }
});
