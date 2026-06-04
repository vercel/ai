export {
  FIXTURE_VERSION,
  loadFixture,
  type HttpExchange,
  type HttpFixture,
  type HttpFixtureBody,
  type HttpRequestMatchMetadata,
  type ReplayRuntimeIdentity,
} from './http-fixture';

export { buildReplayRuntimeIdentity } from './runtime-identity';

export {
  applyStringReplacements,
  auditHttpFixtureRedaction,
  bufferToFixtureBody,
  fixtureBodyToBuffer,
  fixtureBodyToText,
  redactSecretHeaders,
} from './http-fixture-body';

export {
  canonicalizeBody,
  normalizeRouteKey,
  normalizeVolatileString,
  semanticRequestSignature,
} from './http-fixture-normalize';

export {
  createRecordingHandler,
  createReplayHandler,
} from './record-replay-handler';

export {
  startProxyInterception,
  type InterceptionMode,
  type ProxyInterception,
} from './interception/proxy-interceptor';

export {
  startHostFetchInterception,
  type HostFetchInterception,
} from './interception/host-fetch-interceptor';

export {
  REPLAY_ADAPTERS,
  getReplayAdapter,
  type ReplayAdapter,
  type ReplayInterception,
} from './replay-adapters';

export {
  RECORD,
  RECORD_ALL,
  LIVE,
  fixturePath,
  resolveRunMode,
  shouldRunScenario,
  type RunMode,
} from './e2e-shared';

export { withReplayScenarioAgent, type ScenarioContext } from './e2e-scenario';
