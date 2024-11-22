import { JSONValue } from '@ai-sdk/provider';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class DataStore {
  private readonly dataPath: string;

  constructor({ dataPath }: { dataPath: string }) {
    this.dataPath = dataPath;
  }

  async updateRun({
    runId,
    agent,
    state,
    context,
    createdAt,
  }: {
    runId: string;
    state: string;
    agent: string;
    context: JSONValue;
    createdAt: number;
  }) {
    const filePath = path.join(this.dataPath, 'runs', runId, 'state.json');

    // ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    await fs.writeFile(
      filePath,
      JSON.stringify({ runId, agent, createdAt, state, context }),
    );
  }
}
