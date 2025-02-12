import path from 'path';
import fs from 'fs/promises';
import type { TestResult } from './types/test-result';

export class TestResultStore {
  private readonly baseOutputDir: string;
  private readonly startTime: number;
  private readonly timestamp: string;

  constructor() {
    this.baseOutputDir = path.join(__dirname, '../results');
    this.startTime = performance.now();
    this.timestamp = new Date().toISOString();
  }

  get outputDir() {
    return this.baseOutputDir;
  }

  async initializeOutputDir() {
    await fs.mkdir(this.baseOutputDir, { recursive: true });
  }

  async writeMetadata(totalModelsTests: number) {
    const metadataPath = path.join(this.baseOutputDir, '_metadata.json');
    const metadata = {
      lastTestRun: this.timestamp,
      nodeVersion: process.version,
      testDuration: performance.now() - this.startTime,
      schemaVersion: '1.0',
      totalModelsTests,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
  }

  async writeModelResult(
    provider: string,
    modelType: string,
    modelId: string,
    variant: string | undefined,
    testResult: TestResult,
  ) {
    const providerDir = path.join(this.baseOutputDir, provider);
    const modelTypeDir = path.join(providerDir, `${modelType}`);
    await fs.mkdir(modelTypeDir, { recursive: true });

    const safeModelId = modelId.replace(/\//g, '--');
    const fileName = `${safeModelId}${variant ? `-${variant}` : ''}.json`;
    const resultPath = path.join(modelTypeDir, fileName);

    try {
      await fs.writeFile(
        resultPath,
        JSON.stringify(
          {
            ...testResult,
            lastUpdated: new Date().toISOString(),
          },
          null,
          2,
        ) + '\n',
      );
    } catch (error) {
      console.error(
        `Failed to write test results for ${provider}/${modelType}/${modelId}:`,
        error,
      );
    }
  }

  async writeLogEntries(entries: string[]) {
    const logPath = path.join(this.baseOutputDir, '_test-run.log');
    await fs.writeFile(logPath, entries.join('\n'));
  }
}
