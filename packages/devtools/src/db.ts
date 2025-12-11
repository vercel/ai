import path from 'node:path';
import fs from 'node:fs';

const DEFAULT_DEVTOOLS_PORT = 4983;

// ============================================================================
// Types
// ============================================================================

export interface Run {
  id: string;
  started_at: string;
}

export interface Step {
  id: string;
  run_id: string;
  step_number: number;
  type: 'generate' | 'stream';
  model_id: string;
  provider: string | null;
  started_at: string;
  duration_ms: number | null;
  input: string;
  output: string | null;
  usage: string | null;
  error: string | null;
  raw_request: string | null;
  raw_response: string | null;
  raw_chunks: string | null;
  provider_options: string | null;
}

export interface StepResult {
  duration_ms: number;
  output: string | null;
  usage: string | null;
  error: string | null;
  raw_request?: string | null;
  raw_response?: string | null;
  raw_chunks?: string | null;
}

export type StepInput = Omit<
  Step,
  | 'duration_ms'
  | 'output'
  | 'usage'
  | 'error'
  | 'raw_request'
  | 'raw_response'
  | 'raw_chunks'
>;

interface Database {
  runs: Run[];
  steps: Step[];
}

// ============================================================================
// Configuration
// ============================================================================

let notifyEndpoint: string | null = null;
let forwardData = false;
let customFilePath: string | null = null;

// In-memory cache for filesystem storage
let dbCache: Database | null = null;

export function setNotifyEndpoint(endpoint: string | null): void {
  notifyEndpoint = endpoint;
}

export function setForwardData(enabled: boolean): void {
  forwardData = enabled;
}

export function setFilePath(filePath: string | null): void {
  customFilePath = filePath;
}

// ============================================================================
// Filesystem Storage (Node.js only)
// ============================================================================

function getDbPath(): string {
  if (customFilePath) {
    return customFilePath;
  }
  const dbDir = path.join(process.cwd(), '.devtools');
  return path.join(dbDir, 'generations.json');
}

function getDbDir(): string {
  return path.dirname(getDbPath());
}

/**
 * Ensure .devtools is in .gitignore.
 */
function ensureGitignore(): void {
  const dbDir = getDbDir();
  const gitignorePath = path.join(path.dirname(dbDir), '.gitignore');

  if (!fs.existsSync(gitignorePath)) {
    return;
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  const lines = content.split('\n');
  const dirName = path.basename(dbDir);

  const alreadyIgnored = lines.some(
    line => line.trim() === dirName || line.trim() === `${dirName}/`,
  );

  if (!alreadyIgnored) {
    const newContent = content.endsWith('\n')
      ? `${content}${dirName}\n`
      : `${content}\n${dirName}\n`;
    fs.writeFileSync(gitignorePath, newContent);
  }
}

function readDb(): Database {
  try {
    const dbPath = getDbPath();
    if (fs.existsSync(dbPath)) {
      const content = fs.readFileSync(dbPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // If file is corrupted, start fresh
  }
  return { runs: [], steps: [] };
}

function writeDb(db: Database): void {
  const dbDir = getDbDir();
  const dbPath = getDbPath();
  const isFirstRun = !fs.existsSync(dbDir);

  if (isFirstRun) {
    fs.mkdirSync(dbDir, { recursive: true });
    // Only manage gitignore for default .devtools directory
    if (!customFilePath) {
      ensureGitignore();
    }
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function getDb(): Database {
  if (!dbCache) {
    dbCache = readDb();
  }
  return dbCache;
}

function saveDb(db: Database): void {
  dbCache = db;
  writeDb(db);
}

function isNodeEnvironment(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node;
}

// ============================================================================
// Notifications
// ============================================================================

function getDevToolsPort(): number {
  if (typeof process !== 'undefined' && process.env?.AI_SDK_DEVTOOLS_PORT) {
    return parseInt(process.env.AI_SDK_DEVTOOLS_PORT, 10);
  }
  return DEFAULT_DEVTOOLS_PORT;
}

function getNotifyEndpoint(): string {
  if (notifyEndpoint) {
    return notifyEndpoint;
  }
  const port = getDevToolsPort();
  return `http://localhost:${port}`;
}

interface NotifyPayload {
  event: 'run' | 'step' | 'step-update' | 'clear';
  timestamp: number;
  data?: {
    run?: Run;
    step?: Step;
  };
}

const notifyServer = (
  event: NotifyPayload['event'],
  data?: NotifyPayload['data'],
) => {
  notifyServerAsync(event, data);
};

export const notifyServerAsync = async (
  event: NotifyPayload['event'],
  data?: NotifyPayload['data'],
): Promise<void> => {
  try {
    const endpoint = getNotifyEndpoint();
    const payload: NotifyPayload = { event, timestamp: Date.now() };

    if (forwardData && data) {
      payload.data = data;
    }

    await fetch(`${endpoint}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore errors - server might not be running
  }
};

// ============================================================================
// Database Operations
// ============================================================================

export const createRun = async (id: string): Promise<Run> => {
  const started_at = new Date().toISOString();
  const run: Run = { id, started_at };

  // Only write to filesystem in Node.js when not using remote-only mode
  if (isNodeEnvironment() && !forwardData) {
    const db = getDb();
    const existing = db.runs.find(r => r.id === id);
    if (existing) {
      notifyServer('run', { run: existing });
      return existing;
    }
    db.runs.push(run);
    saveDb(db);
  }

  notifyServer('run', { run });
  return run;
};

export const createStep = async (step: StepInput): Promise<void> => {
  const fullStep: Step = {
    ...step,
    duration_ms: null,
    output: null,
    usage: null,
    error: null,
    raw_request: null,
    raw_response: null,
    raw_chunks: null,
  };

  // Only write to filesystem in Node.js when not using remote-only mode
  if (isNodeEnvironment() && !forwardData) {
    const db = getDb();
    db.steps.push(fullStep);
    saveDb(db);
  }

  notifyServer('step', { step: fullStep });
};

export const updateStepResult = async (
  stepId: string,
  result: StepResult,
): Promise<void> => {
  // Only write to filesystem in Node.js when not using remote-only mode
  if (isNodeEnvironment() && !forwardData) {
    const db = getDb();
    const step = db.steps.find(s => s.id === stepId);
    if (step) {
      step.duration_ms = result.duration_ms;
      step.output = result.output;
      step.usage = result.usage;
      step.error = result.error;
      step.raw_request = result.raw_request ?? null;
      step.raw_response = result.raw_response ?? null;
      step.raw_chunks = result.raw_chunks ?? null;
      saveDb(db);
    }
  }

  notifyServer('step-update', {
    step: {
      id: stepId,
      run_id: '',
      step_number: 0,
      type: 'stream',
      model_id: '',
      provider: null,
      started_at: '',
      input: '',
      provider_options: null,
      duration_ms: result.duration_ms,
      output: result.output,
      usage: result.usage,
      error: result.error,
      raw_request: result.raw_request ?? null,
      raw_response: result.raw_response ?? null,
      raw_chunks: result.raw_chunks ?? null,
    },
  });
};

export const getRuns = async (): Promise<Run[]> => {
  if (!isNodeEnvironment()) {
    return [];
  }
  const db = getDb();
  return [...db.runs].sort(
    (a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
};

export const getStepsForRun = async (runId: string): Promise<Step[]> => {
  if (!isNodeEnvironment()) {
    return [];
  }
  const db = getDb();
  return db.steps
    .filter(s => s.run_id === runId)
    .sort((a, b) => a.step_number - b.step_number);
};

export const getRunWithSteps = async (
  runId: string,
): Promise<{ run: Run; steps: Step[] } | null> => {
  if (!isNodeEnvironment()) {
    return null;
  }
  const db = getDb();
  const run = db.runs.find(r => r.id === runId);
  if (!run) return null;
  const steps = db.steps
    .filter(s => s.run_id === runId)
    .sort((a, b) => a.step_number - b.step_number);
  return { run, steps };
};

export const clearDatabase = async (): Promise<void> => {
  if (isNodeEnvironment()) {
    const db: Database = { runs: [], steps: [] };
    saveDb(db);
  }
  notifyServer('clear');
};

export const reloadDb = async (): Promise<void> => {
  if (isNodeEnvironment()) {
    dbCache = readDb();
  }
};
