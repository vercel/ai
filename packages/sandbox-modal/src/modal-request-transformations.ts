import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1RequestTransformation,
} from '@ai-sdk/harness';
import * as modal from 'modal';
import type { ExperimentalOutboundPolicy, Sandbox } from 'modal';
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

type ModalHeaderReplacement = {
  domain: string;
  headers: Record<string, string>;
};

/**
 * Modal's outbound policy is experimental, so the class is looked up on the
 * installed SDK instead of being imported by name.
 */
function getOutboundPolicyClass():
  | typeof ExperimentalOutboundPolicy
  | undefined {
  return 'ExperimentalOutboundPolicy' in modal
    ? modal.ExperimentalOutboundPolicy
    : undefined;
}

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
  if (getOutboundPolicyClass() == null) {
    throw new Error(
      `${functionName}: requestTransformations needs Modal's experimental outbound policy, which the installed modal SDK does not provide.`,
    );
  }
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
 * tag of a sandbox created with an outbound policy, and the installed SDK can
 * replace that policy.
 */
export function supportsRequestTransformations({
  sandbox,
  tags,
}: {
  sandbox: Sandbox;
  tags: Record<string, string>;
}): boolean {
  return (
    tags[REQUEST_TRANSFORMATIONS_TAG] === 'true' &&
    getOutboundPolicyClass() != null &&
    typeof sandbox.experimentalUpdateOutboundPolicy === 'function'
  );
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
 * and the rule is applied to every request to its host. Rules that this
 * widening would change in ways a caller cannot expect are rejected: rules
 * with a `method` or `queryString` matcher, and rules for one host that set
 * the same header to different values.
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
    for (const matcher of ['method', 'queryString'] as const) {
      if (match[matcher] != null) {
        throw createRequestTransformationError(
          `Modal applies a request transformation to every request to its host, so the transformation for "${match.host}" cannot be limited with a ${matcher} matcher.`,
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
          `Modal applies a request transformation to every request to its host, so the transformations for "${conflict.host}" and "${host}" cannot set the "${name}" header to different values. Remove one of them, or replace the earlier one with setRequestTransformations().`,
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
  const OutboundPolicy = getOutboundPolicyClass();
  if (OutboundPolicy == null) {
    throw createRequestTransformationError(
      "The installed modal SDK does not provide Modal's experimental outbound policy.",
    );
  }
  return replacements.reduce(
    (outboundPolicy, replacement) =>
      outboundPolicy.withHeaderReplacement(replacement),
    new OutboundPolicy(),
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
 * Adds rules to the managed set. A rule with the same matchers and header
 * names as an existing one replaces it, which is how a harness adapter
 * refreshes a credential when it resumes a session.
 */
function mergeRequestTransformations({
  existing,
  incoming,
}: {
  existing: ReadonlyArray<HarnessV1RequestTransformation>;
  incoming: ReadonlyArray<HarnessV1RequestTransformation>;
}): HarnessV1RequestTransformation[] {
  const merged = [...existing];
  const identities = new Map(
    merged.map((transformation, index) => [
      getRequestTransformationIdentity(transformation),
      index,
    ]),
  );
  for (const transformation of incoming) {
    const identity = getRequestTransformationIdentity(transformation);
    const existingIndex = identities.get(identity);
    if (existingIndex == null) {
      identities.set(identity, merged.length);
      merged.push(transformation);
    } else {
      merged[existingIndex] = transformation;
    }
  }
  return merged;
}

function getRequestTransformationIdentity(
  transformation: HarnessV1RequestTransformation,
): string {
  return stableSerialize({
    match: transformation.match,
    transformedHeaderNames: Object.keys(transformation.transform.headers)
      .map(name => name.toLowerCase())
      .sort(),
  });
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
