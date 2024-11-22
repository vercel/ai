import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { RunState } from './types/run-state';

export class DataStore {
  private readonly dataPath: string;

  constructor({ dataPath }: { dataPath: string }) {
    this.dataPath = dataPath;
  }

  private getRunPath({ runId, file }: { runId: string; file: string }) {
    return path.join(this.dataPath, 'runs', runId, file);
  }

  async updateRun({ runId, agent, state, context, createdAt }: RunState) {
    const runPath = this.getRunPath({ runId, file: 'state.json' });

    // ensure directory exists
    await fs.mkdir(path.dirname(runPath), { recursive: true });

    await fs.writeFile(
      runPath,
      JSON.stringify({ runId, agent, createdAt, state, context }),
    );
  }

  async getRunState({ runId }: { runId: string }): Promise<RunState> {
    const filePath = this.getRunPath({ runId, file: 'state.json' });
    const state = await fs.readFile(filePath, 'utf8');
    return JSON.parse(state);
  }
}
