import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1RequestTransformation,
} from '@ai-sdk/harness';
import { ExperimentalOutboundPolicy, type Sandbox } from 'modal';
import {
  GRPC_STATUS_FAILED_PRECONDITION,
  MODAL_PROVIDER_ID,
  getErrorCode,
  hasSandboxFinishedMessage,
  type ModalSandboxCreateParams,
} from './utils';

/**
 * Tag on sandboxes that were created with Modal's outbound policy. Modal only
 * replaces the policy of such a sandbox and does not report which sandboxes
 * have one, so the tag is how a reattached session knows.
 */
const REQUEST_TRANSFORMATIONS_TAG = 'ai-sdk-request-transformations';

/**
 * Matchers that are accepted although Modal cannot express them, because the
 * rule is applied to its whole host.
 */
const HOST_WIDE_MATCHERS: ReadonlySet<string> = new Set([
  'host',
  'path',
  'headers',
]);

type ModalHeaderReplacement = {
  domain: string;
  headers: Record<string, string>;
};

/**
 * Rejects creation options that a sandbox with request transformations cannot
 * be created with. Modal does not apply outbound restrictions to the HTTPS
 * traffic of a sandbox that has an outbound policy, so restrictions fail here
 * instead of being silently left unenforced.
 */
export function assertRequestTransformationSettings({
  functionName,
  createParams,
}: {
  functionName: string;
  createParams: ModalSandboxCreateParams;
}): void {
  if (
    createParams.blockNetwork === true ||
    createParams.outboundCidrAllowlist != null ||
    createParams.outboundDomainAllowlist != null
  ) {
    throw new Error(
      `${functionName}: requestTransformations cannot be combined with blockNetwork, outboundCidrAllowlist, or outboundDomainAllowlist. Modal does not restrict the outbound HTTPS traffic of a sandbox that uses its outbound policy.`,
    );
  }
}

/**
 * Creation parameters for a sandbox that accepts request transformations. The
 * sandbox starts with an empty outbound policy, which is enough for Modal to
 * replace the policy later, and without the allow-all allowlists, which Modal
 * does not combine with an outbound policy.
 */
export function withRequestTransformationSettings(
  createParams: ModalSandboxCreateParams,
): ModalSandboxCreateParams {
  const {
    outboundCidrAllowlist: _outboundCidrAllowlist,
    outboundDomainAllowlist: _outboundDomainAllowlist,
    ...openNetworkParams
  } = createParams;
  return {
    ...openNetworkParams,
    tags: { ...createParams.tags, [REQUEST_TRANSFORMATIONS_TAG]: 'true' },
    experimentalOutboundPolicy: toModalOutboundPolicy([]),
  };
}

/**
 * Whether a running sandbox accepts request transformations: it carries the
 * tag of a sandbox created with an outbound policy.
 */
export function supportsRequestTransformations(
  tags: Record<string, string>,
): boolean {
  return tags[REQUEST_TRANSFORMATIONS_TAG] === 'true';
}

/**
 * Owns the outbound policy of one live sandbox. Modal replaces the whole
 * policy on every update and does not report the current one, so every
 * mutation composes the complete rule set from private state. A session that
 * reattaches to a running sandbox starts without that state: its first
 * mutation replaces whatever an earlier session installed.
 */
export class ModalRequestTransformationManager {
  readonly #sandbox: Sandbox;
  #transformations: ReadonlyArray<HarnessV1RequestTransformation> = [];
  #mutationQueue: Promise<void> = Promise.resolve();

  constructor({ sandbox }: { sandbox: Sandbox }) {
    this.#sandbox = sandbox;
  }

  setRequestTransformations(
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ): Promise<void> {
    return this.#enqueueMutation(() =>
      this.#apply(transformations.map(cloneRequestTransformation)),
    );
  }

  addRequestTransformations(
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ): Promise<void> {
    return this.#enqueueMutation(() =>
      this.#apply(
        mergeRequestTransformations({
          existing: this.#transformations,
          incoming: transformations.map(cloneRequestTransformation),
        }),
      ),
    );
  }

  #enqueueMutation(operation: () => Promise<void>): Promise<void> {
    /*
     * Each mutation derives a complete replacement from private state, so
     * mutations run in invocation order, and a failed one must not poison the
     * queue.
     */
    const result = this.#mutationQueue.then(operation);
    this.#mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #apply(
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ): Promise<void> {
    const outboundPolicy = toModalOutboundPolicy(
      toModalHeaderReplacements(transformations),
    );
    try {
      await this.#sandbox.experimentalUpdateOutboundPolicy(outboundPolicy);
    } catch (error) {
      if (
        getErrorCode(error) !== GRPC_STATUS_FAILED_PRECONDITION ||
        hasSandboxFinishedMessage(error)
      ) {
        throw error;
      }
      throw createRequestTransformationError(
        "Modal cannot change the request transformations of this sandbox. A sandbox accepts them only when it was created with Modal's outbound policy, which createModalNetworkSandboxSession() does when `requestTransformations: true` is passed.",
        error,
      );
    }
    this.#transformations = transformations;
  }
}

/**
 * Maps request transformations onto Modal's header replacements, which are
 * scoped by host alone. A rule's `path` and `headers` matchers are accepted
 * without narrowing the rule: it is applied to every request to its host, so
 * the real header values are attached to every request the sandbox sends
 * there, with or without the placeholder. Rules that this widening would
 * change in ways a caller cannot expect are rejected: rules with a `method`
 * or `queryString` matcher or any other matcher Modal cannot express, and
 * rules for one host that set the same header to different values.
 */
export function toModalHeaderReplacements(
  transformations: ReadonlyArray<HarnessV1RequestTransformation>,
): ModalHeaderReplacement[] {
  // Hosts and header names are case-insensitive, so both are compared in
  // lower case. A header keeps the spelling of the first rule that sets it.
  const assignments: Array<{ host: string; header: string; value: string }> =
    [];
  const headersByHost = new Map<string, Map<string, [string, string]>>();

  for (const { match, transform } of transformations) {
    for (const [matcher, value] of Object.entries(match)) {
      if (value != null && !HOST_WIDE_MATCHERS.has(matcher)) {
        throw createRequestTransformationError(
          `Modal applies a request transformation to every request to its host, so the transformation for "${match.host}" cannot be limited with a ${matcher} matcher. Only path and headers matchers are accepted, and they do not narrow the transformation: its headers are attached to every request the sandbox sends to that host, with or without the placeholder. A method or queryString matcher, or any other matcher Modal cannot express, is rejected.`,
        );
      }
    }

    const host = match.host.toLowerCase();
    for (const [name, value] of Object.entries(transform.headers)) {
      const header = name.toLowerCase();
      const conflict = assignments.find(
        assignment =>
          assignment.header === header &&
          assignment.value !== value &&
          hostPatternsOverlap(assignment.host, host),
      );
      if (conflict != null) {
        throw createRequestTransformationError(
          `Modal holds one value per host and header and applies it to every request to its host, so the "${name}" header for "${host}" cannot be set to a value that differs from the one already set for "${conflict.host}". A different credential for that host needs a new sandbox session, or a resume that carries the original credential environment.`,
        );
      }
      assignments.push({ host, header, value });

      const headers =
        headersByHost.get(host) ?? new Map<string, [string, string]>();
      // Modal resolves `$KEY` in a value against a secret; `$$` is a literal.
      headers.set(header, [
        headers.get(header)?.[0] ?? name,
        value.split('$').join('$$'),
      ]);
      headersByHost.set(host, headers);
    }
  }

  return Array.from(headersByHost, ([domain, headers]) => ({
    domain,
    headers: Object.fromEntries(headers.values()),
  }));
}

function toModalOutboundPolicy(
  replacements: ReadonlyArray<ModalHeaderReplacement>,
): ExperimentalOutboundPolicy {
  return replacements.reduce(
    (outboundPolicy, replacement) =>
      outboundPolicy.withHeaderReplacement(replacement),
    new ExperimentalOutboundPolicy(),
  );
}

/**
 * Whether two Modal domain patterns can match the same host. `*` matches
 * every host, and `*.example.com` matches `example.com` and its subdomains.
 */
function hostPatternsOverlap(first: string, second: string): boolean {
  return (
    hostPatternCovers({ pattern: first, host: second }) ||
    hostPatternCovers({ pattern: second, host: first })
  );
}

function hostPatternCovers({
  pattern,
  host,
}: {
  pattern: string;
  host: string;
}): boolean {
  if (pattern === host || pattern === '*') return true;
  if (!pattern.startsWith('*.')) return false;
  const apex = pattern.slice(2);
  const hostName = host.startsWith('*.') ? host.slice(2) : host;
  return hostName === apex || hostName.endsWith(`.${apex}`);
}

/**
 * Adds rules to the managed set. A rule is identified by what Modal can
 * express: its host and the names of the headers it sets. A rule that is
 * added again with the same matchers replaces the managed one, which is how a
 * harness adapter refreshes a credential when it resumes a session. Under
 * other matchers, such as a new placeholder, the same header values leave the
 * managed rule in place, and different ones are added as a second rule, which
 * `toModalHeaderReplacements` rejects.
 */
function mergeRequestTransformations({
  existing,
  incoming,
}: {
  existing: ReadonlyArray<HarnessV1RequestTransformation>;
  incoming: ReadonlyArray<HarnessV1RequestTransformation>;
}): HarnessV1RequestTransformation[] {
  const merged = [...existing];
  for (const transformation of incoming) {
    const identity = getRequestTransformationIdentity(transformation);
    const managedIndex = merged.findIndex(
      managed => getRequestTransformationIdentity(managed) === identity,
    );
    const managed = merged[managedIndex];
    if (managed == null) {
      merged.push(transformation);
    } else if (
      stableSerialize(managed.match) === stableSerialize(transformation.match)
    ) {
      merged[managedIndex] = transformation;
    } else if (
      stableSerialize(getHeaderAssignments(managed)) !==
      stableSerialize(getHeaderAssignments(transformation))
    ) {
      merged.push(transformation);
    }
  }
  return merged;
}

function getRequestTransformationIdentity(
  transformation: HarnessV1RequestTransformation,
): string {
  return stableSerialize({
    host: transformation.match.host.toLowerCase(),
    headerNames: getHeaderAssignments(transformation).map(([name]) => name),
  });
}

function getHeaderAssignments(
  transformation: HarnessV1RequestTransformation,
): Array<[string, string]> {
  return Object.entries(transformation.transform.headers)
    .map(([name, value]): [string, string] => [name.toLowerCase(), value])
    .sort(([firstName], [secondName]) => firstName.localeCompare(secondName));
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value != null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableSerialize(entryValue)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function cloneRequestTransformation(
  transformation: HarnessV1RequestTransformation,
): HarnessV1RequestTransformation {
  return structuredClone(transformation);
}

function createRequestTransformationError(
  message: string,
  cause?: unknown,
): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    harnessId: MODAL_PROVIDER_ID,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
