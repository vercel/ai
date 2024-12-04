import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { RunState } from './types/run-state';
import { JSONValue } from '@ai-sdk/provider';

export class DataStore {
  private readonly dataPath: string;

  constructor({ dataPath }: { dataPath: string }) {
    this.dataPath = dataPath;
  }

  private getRunPath({ runId, file }: { runId: string; file?: string }) {
    return file == null
      ? path.join(this.dataPath, 'runs', runId)
      : path.join(this.dataPath, 'runs', runId, file);
  }

  async updateRun(runState: RunState) {
    const runPath = this.getRunPath({
      runId: runState.runId,
      file: 'state.json',
    });

    await fs.mkdir(path.dirname(runPath), { recursive: true });
    await fs.writeFile(runPath, JSON.stringify(runState, null, 2));
  }

  async getRunState({ runId }: { runId: string }): Promise<RunState> {
    const filePath = this.getRunPath({ runId, file: 'state.json' });
    const state = await fs.readFile(filePath, 'utf8');
    return JSON.parse(state);
  }

  async storeStepState(stepState: {
    runId: string;
    step: number;
    status: 'RUNNING' | 'FINISHED';
    inputContext: JSONValue;
    outputContext?: JSONValue;
    nextTask?: string;
  }) {
    const filePath = this.getRunPath({
      runId: stepState.runId,
      file: `step-${stepState.step}.json`,
    });

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(stepState, null, 2));
  }

  async appendToStepStream({
    runId,
    step,
    chunk,
  }: {
    runId: string;
    step: number;
    chunk: JSONValue;
  }) {
    const filePath = this.getRunPath({
      runId,
      file: `step-${step}.stream.json`,
    });

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(chunk) + '\n');
  }

  async loadRunStreamRecording({
    runId,
  }: {
    runId: string;
  }): Promise<Array<JSONValue>> {
    const files = await fs.readdir(this.getRunPath({ runId }));

    const streamFiles = files
      .filter(file => file.startsWith('step-') && file.endsWith('.stream.json'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const streamContent: Array<JSONValue> = [];
    for (const file of streamFiles) {
      const filePath = this.getRunPath({ runId, file });
      const fileContent = await fs.readFile(filePath, 'utf8');
      streamContent.push(
        ...fileContent
          .split('\n')
          .filter(line => line.trim() !== '')
          .map(line => JSON.parse(line)),
      );
    }

    return streamContent;
  }
}
