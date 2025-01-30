import type { Reporter } from 'vitest/reporters';
import type { RunnerTestFile, RunnerTaskResultPack } from 'vitest';
import { TestResultStore } from './test-result-store';

export default class TestResultReporter implements Reporter {
  private results: string[] = [];

  onTaskUpdate(packs: RunnerTaskResultPack[]) {
    try {
      for (const pack of packs) {
        const [taskId, result] = pack;
        if (result?.state === 'fail') {
          this.results.push(`FAIL: ${taskId}`);
          this.results.push(`Error: ${JSON.stringify(result.errors)}`);
        } else if (result?.state === 'pass') {
          this.results.push(`PASS: ${taskId}`);
        }
        this.results.push('---');
      }
    } catch (error) {
      console.error('Error in onTaskUpdate', error);
    }
  }

  async onFinished(
    files: RunnerTestFile[],
    errors: unknown[],
    coverage?: unknown,
  ) {
    const resultStore = new TestResultStore();
    await resultStore.writeLogEntries(this.results);
  }
}
