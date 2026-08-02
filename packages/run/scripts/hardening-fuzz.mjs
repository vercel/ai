import { createSignedContinuationCodec } from '../dist/index.js';
import { assertContinuationState } from '../dist/continuation-validation.js';
import {
  assertMainToWorkerMessage,
  assertWorkerToMainMessage,
} from '../dist/runtime/protocol-validation.js';
import { normalizeOptions } from '../dist/utils/options.js';

const iterations = positiveInteger(
  process.env.RUN_HARDENING_FUZZ_ITERATIONS,
  100_000,
);
const seed = positiveInteger(process.env.RUN_HARDENING_SEED, 0x5eed1234);
let randomState = seed >>> 0;

const state = {
  version: 1,
  runtime: 'run-replay-v1',
  source: 'return await tools.pause();',
  logicalRunId: '03'.repeat(16),
  scopeHash: '02'.repeat(32),
  determinism: {
    dateNowMs: 1_700_000_000_000,
    randomSeed: '01'.repeat(16),
  },
  ledger: [
    {
      bindingName: 'tools.pause',
      inputJson: '',
      status: 'interrupted',
      interruptionId: 'interrupt-1',
      payload: { kind: 'pause' },
    },
  ],
};

const codec = createSignedContinuationCodec({ secret: 's'.repeat(32) });
const token = codec.encode(state);
let tokenRejections = 0;
let stateRejections = 0;
let protocolRejections = 0;
let protocolMutationRejections = 0;
const startedAt = performance.now();
const validProtocolMessages = [
  {
    direction: 'main',
    value: { type: 'cancel', invocationId: 'run-a' },
  },
  {
    direction: 'worker',
    value: { type: 'ready', invocationId: 'run-a' },
  },
  {
    direction: 'worker',
    value: {
      type: 'binding-request',
      invocationId: 'run-a',
      requestId: 'request-a',
      bindingName: 'tools.echo',
      inputJson: 'null',
    },
  },
];

for (let iteration = 0; iteration < iterations; iteration++) {
  const index = next() % token.length;
  const replacement = String.fromCodePoint(33 + (next() % 90));
  const mutation = `${token.slice(0, index)}${replacement}${token.slice(index + 1)}`;
  if (mutation !== token) {
    try {
      codec.decode(mutation);
      throw new Error(`Token mutation accepted at iteration ${iteration}.`);
    } catch (error) {
      if (error?.code !== 'RUN_PROTOCOL_ERROR') throw error;
      tokenRejections++;
    }
  }

  const malformedState = structuredClone(state);
  switch (next() % 6) {
    case 0:
      malformedState.version = 2;
      break;
    case 1:
      malformedState.runtime = 'other';
      break;
    case 2:
      malformedState.determinism.randomSeed = String(next());
      break;
    case 3:
      malformedState.ledger[0].inputJson = '{';
      break;
    case 4:
      malformedState.ledger[0].interruptionId = `changed-${next()}`;
      break;
    default:
      malformedState.extra = generatedValue(0);
  }
  try {
    assertContinuationState(
      malformedState,
      state.source,
      state.scopeHash,
      normalizeOptions(),
    );
    throw new Error(`State mutation accepted at iteration ${iteration}.`);
  } catch (error) {
    if (error?.code !== 'RUN_PROTOCOL_ERROR') throw error;
    stateRejections++;
  }

  const protocolValue = generatedValue(0);
  for (const validate of [
    value => assertMainToWorkerMessage(value),
    value => assertWorkerToMainMessage(value),
  ]) {
    try {
      validate(protocolValue);
    } catch (error) {
      if (error?.code !== 'RUN_PROTOCOL_ERROR') throw error;
      protocolRejections++;
    }
  }

  const candidate = structuredClone(validProtocolMessages[next() % validProtocolMessages.length]);
  const validateCandidate = candidate.direction === 'main'
    ? assertMainToWorkerMessage
    : assertWorkerToMainMessage;
  const protocolMutation = candidate.value;
  if (next() % 2 === 0) {
    const keys = Object.keys(protocolMutation);
    delete protocolMutation[keys[next() % keys.length]];
  } else {
    protocolMutation[`unexpected-${next()}`] = true;
  }
  try {
    validateCandidate(protocolMutation);
    throw new Error(`Protocol mutation accepted at iteration ${iteration}.`);
  } catch (error) {
    if (error?.code !== 'RUN_PROTOCOL_ERROR') throw error;
    protocolMutationRejections++;
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      iterations,
      seed,
      tokenRejections,
      stateRejections,
      protocolRejections,
      protocolMutationRejections,
      durationMs: Math.round(performance.now() - startedAt),
    },
    null,
    2,
  )}\n`,
);

function next() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return randomState >>> 0;
}

function generatedValue(depth) {
  const choice = next() % (depth > 2 ? 5 : 8);
  if (choice === 0) return null;
  if (choice === 1) return next();
  if (choice === 2) return `value-${next()}`;
  if (choice === 3) return Boolean(next() & 1);
  if (choice === 4) return undefined;
  if (choice === 5) {
    return Array.from({ length: next() % 4 }, () =>
      generatedValue(depth + 1),
    );
  }
  const result = {};
  for (let index = 0; index < next() % 5; index++) {
    result[`key-${next() % 12}`] = generatedValue(depth + 1);
  }
  return result;
}

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`Expected a positive integer, received ${value}.`);
  }
  return parsed;
}
