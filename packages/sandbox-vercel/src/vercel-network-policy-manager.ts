import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkPolicy,
  type HarnessV1RequestTransformation,
} from '@ai-sdk/harness';
import type {
  NetworkPolicy,
  NetworkPolicyKeyValueMatcher,
  NetworkPolicyMatcher,
  NetworkPolicyRule,
  Sandbox,
} from '@vercel/sandbox';

const VERCEL_PROVIDER_ID = 'vercel-sandbox';

type NetworkAccessPolicy =
  | { readonly mode: 'allow-all' }
  | { readonly mode: 'deny-all' }
  | {
      readonly mode: 'custom';
      readonly allowedHosts: ReadonlyArray<string>;
      readonly allowedCIDRs: ReadonlyArray<string>;
      readonly deniedCIDRs: ReadonlyArray<string>;
    };

type ForwardRule = {
  readonly host: string;
  readonly match?: NetworkPolicyRule['match'];
  readonly forwardURL: string;
};

type ManagedPolicyState = {
  readonly accessPolicy: NetworkAccessPolicy;
  readonly requestTransformations: ReadonlyArray<HarnessV1RequestTransformation>;
  readonly forwardRules: ReadonlyArray<ForwardRule>;
  readonly effectivePolicy: NetworkPolicy;
};

type CurrentPolicyInspection = {
  readonly accessPolicy: NetworkAccessPolicy;
  readonly forwardRules: ReadonlyArray<ForwardRule>;
  readonly requestTransformationHosts: ReadonlyArray<string>;
  readonly currentPolicy: NetworkPolicy;
};

/**
 * Owns the complete Vercel Sandbox network-policy value for one live session.
 * Vercel combines network access, request transformations, and forwarding in a
 * single structure, so every mutation must be composed here before replacing
 * that structure through `sandbox.update()`.
 */
export class VercelNetworkPolicyManager {
  readonly #sandbox: Sandbox;
  #state: ManagedPolicyState | undefined;
  #mutationQueue: Promise<void> = Promise.resolve();

  constructor({ sandbox }: { sandbox: Sandbox }) {
    this.#sandbox = sandbox;
  }

  setNetworkPolicy(policy: HarnessV1NetworkPolicy): Promise<void> {
    return this.#enqueueMutation(async () => {
      const inspection = this.#inspectPolicy();
      if (
        this.#state == null &&
        inspection.requestTransformationHosts.length > 0
      ) {
        throw createPolicyConflictError(
          'Cannot set the network policy because the current Vercel Sandbox policy contains request transformations whose redacted values cannot be preserved safely. Replace them explicitly with setRequestTransformations() or rehydrate them with addRequestTransformations() first.',
        );
      }

      await this.#applyState({
        accessPolicy: toNetworkAccessPolicy(policy),
        requestTransformations:
          this.#state?.requestTransformations.map(cloneRequestTransformation) ??
          [],
        forwardRules: inspection.forwardRules.map(cloneForwardRule),
        currentPolicy: inspection.currentPolicy,
      });
    });
  }

  setRequestTransformations(
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ): Promise<void> {
    return this.#enqueueMutation(async () => {
      const inspection = this.#inspectPolicy();
      await this.#applyState({
        accessPolicy: inspection.accessPolicy,
        requestTransformations: transformations.map(cloneRequestTransformation),
        forwardRules: inspection.forwardRules.map(cloneForwardRule),
        currentPolicy: inspection.currentPolicy,
      });
    });
  }

  addRequestTransformations(
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ): Promise<void> {
    return this.#enqueueMutation(async () => {
      const inspection = this.#inspectPolicy();
      const incomingTransformations = transformations.map(
        cloneRequestTransformation,
      );

      if (this.#state == null) {
        const incomingPolicy = composeNetworkPolicy({
          accessPolicy: inspection.accessPolicy,
          requestTransformations: incomingTransformations,
          forwardRules: inspection.forwardRules,
        });
        const incomingHosts = getRequestTransformationHosts(incomingPolicy);

        /*
         * Vercel redacts transformed header values when a policy is read back.
         * It can also normalize rule details, so initialization and resume can
         * only attribute existing transformations by their materialized hosts.
         * External transformations for the same hosts are indistinguishable
         * and are necessarily treated as managed by this call.
         */
        if (
          !isHostSetSubset({
            subset: inspection.requestTransformationHosts,
            superset: incomingHosts,
          })
        ) {
          throw createPolicyConflictError(
            'Cannot add request transformations because the current Vercel Sandbox policy contains request transformations that cannot be attributed to this call. Their header values are redacted, so preserving them safely is not possible.',
          );
        }
      }

      await this.#applyState({
        accessPolicy: inspection.accessPolicy,
        requestTransformations:
          this.#state == null
            ? incomingTransformations
            : mergeRequestTransformations({
                existing: this.#state.requestTransformations,
                incoming: incomingTransformations,
              }),
        forwardRules: inspection.forwardRules.map(cloneForwardRule),
        currentPolicy: inspection.currentPolicy,
      });
    });
  }

  #enqueueMutation(operation: () => Promise<void>): Promise<void> {
    /*
     * Each mutation derives a complete replacement from private state. The
     * whole inspect, compose, update, and commit sequence must therefore run in
     * invocation order, while a failed operation must not poison the queue.
     */
    const result = this.#mutationQueue.then(operation);
    this.#mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #inspectPolicy(): CurrentPolicyInspection {
    /*
     * Once initialized, this manager is the sole supported owner of the
     * session's network policy. Direct native Sandbox policy mutations can
     * make the private desired state stale and are intentionally not tracked.
     */
    if (this.#state != null) {
      return {
        accessPolicy: this.#state.accessPolicy,
        forwardRules: this.#state.forwardRules,
        requestTransformationHosts: [],
        currentPolicy: this.#state.effectivePolicy,
      };
    }

    return inspectCurrentPolicy(
      this.#sandbox.currentSession().networkPolicy ?? 'allow-all',
    );
  }

  async #applyState({
    accessPolicy,
    requestTransformations,
    forwardRules,
    currentPolicy,
  }: {
    accessPolicy: NetworkAccessPolicy;
    requestTransformations: ReadonlyArray<HarnessV1RequestTransformation>;
    forwardRules: ReadonlyArray<ForwardRule>;
    currentPolicy: NetworkPolicy;
  }): Promise<void> {
    const effectivePolicy = composeNetworkPolicy({
      accessPolicy,
      requestTransformations,
      forwardRules,
    });

    if (
      !areNetworkPoliciesEqual({
        first: currentPolicy,
        second: effectivePolicy,
      })
    ) {
      await this.#sandbox.update({ networkPolicy: effectivePolicy });
    }

    this.#state = {
      accessPolicy: cloneNetworkAccessPolicy(accessPolicy),
      requestTransformations: requestTransformations.map(
        cloneRequestTransformation,
      ),
      forwardRules: forwardRules.map(cloneForwardRule),
      effectivePolicy,
    };
  }
}

function inspectCurrentPolicy(policy: NetworkPolicy): CurrentPolicyInspection {
  if (policy === 'allow-all' || policy === 'deny-all') {
    return {
      accessPolicy: { mode: policy },
      forwardRules: [],
      requestTransformationHosts: [],
      currentPolicy: policy,
    };
  }

  const allowedHosts = Array.isArray(policy.allow)
    ? [...policy.allow]
    : Object.keys(policy.allow ?? {});
  const forwardRules: ForwardRule[] = [];
  const requestTransformationHosts = new Set<string>();

  /*
   * Forwarding URLs and matchers survive Vercel's policy readback and can be
   * retained verbatim. Transformed header values do not, so transformations
   * are represented only by fingerprints until a caller supplies the values.
   */
  if (policy.allow != null && !Array.isArray(policy.allow)) {
    for (const [host, rules] of Object.entries(policy.allow)) {
      for (const rule of rules) {
        if (hasRequestTransformation(rule)) {
          requestTransformationHosts.add(host.toLowerCase());
        }
        if (rule.forwardURL != null) {
          forwardRules.push({
            host,
            ...(rule.match == null ? {} : { match: cloneMatch(rule.match) }),
            forwardURL: rule.forwardURL,
          });
        }
      }
    }
  }

  return {
    accessPolicy: {
      mode: 'custom',
      allowedHosts: minimizeHostPatterns(allowedHosts),
      allowedCIDRs: [...(policy.subnets?.allow ?? [])],
      deniedCIDRs: [...(policy.subnets?.deny ?? [])],
    },
    forwardRules,
    requestTransformationHosts: [...requestTransformationHosts],
    currentPolicy: cloneNetworkPolicy(policy),
  };
}

function toNetworkAccessPolicy(
  policy: HarnessV1NetworkPolicy,
): NetworkAccessPolicy {
  switch (policy.mode) {
    case 'allow-all':
      return { mode: 'allow-all' };
    case 'deny-all':
      return { mode: 'deny-all' };
    case 'custom': {
      const allowedHosts = [...(policy.allowedHosts ?? [])];
      const allowedCIDRs = [...(policy.allowedCIDRs ?? [])];
      const deniedCIDRs = [...(policy.deniedCIDRs ?? [])];
      if (
        allowedHosts.length === 0 &&
        allowedCIDRs.length === 0 &&
        deniedCIDRs.length === 0
      ) {
        throw createPolicyConflictError(
          'Custom network policy requires at least one of allowedHosts, allowedCIDRs, or deniedCIDRs to be non-empty.',
        );
      }
      return {
        mode: 'custom',
        allowedHosts,
        allowedCIDRs,
        deniedCIDRs,
      };
    }
  }
}

function composeNetworkPolicy({
  accessPolicy,
  requestTransformations,
  forwardRules,
}: {
  accessPolicy: NetworkAccessPolicy;
  requestTransformations: ReadonlyArray<HarnessV1RequestTransformation>;
  forwardRules: ReadonlyArray<ForwardRule>;
}): NetworkPolicy {
  /*
   * Access is authoritative even though Vercel stores all three concepts in
   * one allow map. Rules without a hostname intersection are omitted from the
   * effective policy but remain in private desired state, so a later access
   * change can activate them. CIDR access never activates hostname rules.
   */
  if (accessPolicy.mode === 'deny-all') {
    return 'deny-all';
  }

  const rulesByHost = new Map<string, NetworkPolicyRule[]>();
  const allowedHosts =
    accessPolicy.mode === 'allow-all' ? ['*'] : accessPolicy.allowedHosts;

  for (const host of allowedHosts) {
    rulesByHost.set(host, []);
  }

  for (const transformation of requestTransformations) {
    for (const host of getActiveHostPatterns({
      allowedHosts,
      ruleHost: transformation.match.host,
    })) {
      appendRule({
        rulesByHost,
        host,
        rule: toVercelRequestTransformationRule(transformation),
      });
    }
  }

  /*
   * Transformations and forwarding rules for one host must share the same
   * Vercel allow-map array. Transformations are inserted first to match the
   * ordering produced when the Vercel SDK reconstructs a policy.
   */
  for (const forwardRule of forwardRules) {
    for (const host of getActiveHostPatterns({
      allowedHosts,
      ruleHost: forwardRule.host,
    })) {
      appendRule({
        rulesByHost,
        host,
        rule: {
          ...(forwardRule.match == null
            ? {}
            : { match: cloneMatch(forwardRule.match) }),
          forwardURL: forwardRule.forwardURL,
        },
      });
    }
  }

  const hasActiveRules = [...rulesByHost.values()].some(
    rules => rules.length > 0,
  );
  if (!hasActiveRules) {
    return toVercelAccessPolicy(accessPolicy);
  }

  return {
    allow: Object.fromEntries(rulesByHost),
    ...(accessPolicy.mode !== 'custom' ? {} : toVercelSubnets(accessPolicy)),
  };
}

function toVercelAccessPolicy(
  accessPolicy: NetworkAccessPolicy,
): NetworkPolicy {
  if (accessPolicy.mode === 'allow-all' || accessPolicy.mode === 'deny-all') {
    return accessPolicy.mode;
  }

  return {
    ...(accessPolicy.allowedHosts.length === 0
      ? {}
      : { allow: [...accessPolicy.allowedHosts] }),
    ...toVercelSubnets(accessPolicy),
  };
}

function toVercelSubnets(
  accessPolicy: Extract<NetworkAccessPolicy, { mode: 'custom' }>,
): Pick<Exclude<NetworkPolicy, string>, 'subnets'> {
  if (
    accessPolicy.allowedCIDRs.length === 0 &&
    accessPolicy.deniedCIDRs.length === 0
  ) {
    return {};
  }
  return {
    subnets: {
      ...(accessPolicy.allowedCIDRs.length === 0
        ? {}
        : { allow: [...accessPolicy.allowedCIDRs] }),
      ...(accessPolicy.deniedCIDRs.length === 0
        ? {}
        : { deny: [...accessPolicy.deniedCIDRs] }),
    },
  };
}

function getActiveHostPatterns({
  allowedHosts,
  ruleHost,
}: {
  allowedHosts: ReadonlyArray<string>;
  ruleHost: string;
}): ReadonlyArray<string> {
  return minimizeHostPatterns(
    allowedHosts.flatMap(allowedHost => {
      const intersection = intersectHostPatterns({
        first: allowedHost,
        second: ruleHost,
      });
      return intersection == null ? [] : [intersection];
    }),
  );
}

function intersectHostPatterns({
  first,
  second,
}: {
  first: string;
  second: string;
}): string | undefined {
  if (isHostPatternSubset({ candidate: first, container: second })) {
    return first;
  }
  if (isHostPatternSubset({ candidate: second, container: first })) {
    return second;
  }
  return undefined;
}

function isHostPatternSubset({
  candidate,
  container,
}: {
  candidate: string;
  container: string;
}): boolean {
  const normalizedCandidate = candidate.toLowerCase();
  const normalizedContainer = container.toLowerCase();
  if (
    normalizedCandidate === normalizedContainer ||
    normalizedContainer === '*'
  ) {
    return true;
  }
  if (normalizedCandidate === '*' || !normalizedContainer.startsWith('*')) {
    return false;
  }

  const containerSuffix = normalizedContainer.slice(1);
  return normalizedCandidate.startsWith('*')
    ? normalizedCandidate.slice(1).endsWith(containerSuffix)
    : normalizedCandidate.endsWith(containerSuffix);
}

function minimizeHostPatterns(
  patterns: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const uniquePatterns = [...new Set(patterns)];
  return uniquePatterns.filter(
    pattern =>
      !uniquePatterns.some(
        other =>
          other !== pattern &&
          isHostPatternSubset({ candidate: pattern, container: other }),
      ),
  );
}

function appendRule({
  rulesByHost,
  host,
  rule,
}: {
  rulesByHost: Map<string, NetworkPolicyRule[]>;
  host: string;
  rule: NetworkPolicyRule;
}): void {
  const rules = rulesByHost.get(host) ?? [];
  rules.push(rule);
  rulesByHost.set(host, rules);
}

function toVercelRequestTransformationRule(
  transformation: HarnessV1RequestTransformation,
): NetworkPolicyRule {
  const {
    host: _host,
    method,
    path,
    queryString,
    headers,
  } = transformation.match;
  const match = {
    ...(path == null ? {} : { path: cloneMatcher(path) }),
    ...(method == null ? {} : { method: [...method] }),
    ...(queryString == null
      ? {}
      : { queryString: queryString.map(cloneKeyValueMatcher) }),
    ...(headers == null ? {} : { headers: headers.map(cloneKeyValueMatcher) }),
  };

  return {
    ...(Object.keys(match).length === 0 ? {} : { match }),
    transform: [{ headers: { ...transformation.transform.headers } }],
  };
}

function hasRequestTransformation(rule: NetworkPolicyRule): boolean {
  return (
    rule.transform?.some(
      transformation =>
        transformation.headers != null &&
        Object.keys(transformation.headers).length > 0,
    ) ?? false
  );
}

function getRequestTransformationHosts(
  policy: NetworkPolicy,
): ReadonlyArray<string> {
  if (
    policy === 'allow-all' ||
    policy === 'deny-all' ||
    policy.allow == null ||
    Array.isArray(policy.allow)
  ) {
    return [];
  }

  const hosts = new Set<string>();
  for (const [host, rules] of Object.entries(policy.allow)) {
    for (const rule of rules) {
      if (hasRequestTransformation(rule)) {
        hosts.add(host.toLowerCase());
      }
    }
  }
  return [...hosts];
}

function isHostSetSubset({
  subset,
  superset,
}: {
  subset: ReadonlyArray<string>;
  superset: ReadonlyArray<string>;
}): boolean {
  const allowedHosts = new Set(superset.map(host => host.toLowerCase()));
  return subset.every(host => allowedHosts.has(host.toLowerCase()));
}

function areNetworkPoliciesEqual({
  first,
  second,
}: {
  first: NetworkPolicy;
  second: NetworkPolicy;
}): boolean {
  return stableSerialize(first) === stableSerialize(second);
}

function mergeRequestTransformations({
  existing,
  incoming,
}: {
  existing: ReadonlyArray<HarnessV1RequestTransformation>;
  incoming: ReadonlyArray<HarnessV1RequestTransformation>;
}): HarnessV1RequestTransformation[] {
  const merged = existing.map(cloneRequestTransformation);
  const identities = new Map(
    merged.map((transformation, index) => [
      getRequestTransformationIdentity(transformation),
      index,
    ]),
  );

  for (const transformation of incoming) {
    const clonedTransformation = cloneRequestTransformation(transformation);
    const identity = getRequestTransformationIdentity(clonedTransformation);
    const existingIndex = identities.get(identity);
    if (existingIndex == null) {
      identities.set(identity, merged.length);
      merged.push(clonedTransformation);
    } else {
      merged[existingIndex] = clonedTransformation;
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
  return {
    match: {
      host: transformation.match.host,
      ...(transformation.match.path == null
        ? {}
        : { path: cloneHarnessMatcher(transformation.match.path) }),
      ...(transformation.match.method == null
        ? {}
        : { method: [...transformation.match.method] }),
      ...(transformation.match.queryString == null
        ? {}
        : {
            queryString: transformation.match.queryString.map(
              cloneHarnessKeyValueMatcher,
            ),
          }),
      ...(transformation.match.headers == null
        ? {}
        : {
            headers: transformation.match.headers.map(
              cloneHarnessKeyValueMatcher,
            ),
          }),
    },
    transform: { headers: { ...transformation.transform.headers } },
  };
}

function cloneForwardRule(rule: ForwardRule): ForwardRule {
  return {
    host: rule.host,
    ...(rule.match == null ? {} : { match: cloneMatch(rule.match) }),
    forwardURL: rule.forwardURL,
  };
}

function cloneNetworkAccessPolicy(
  policy: NetworkAccessPolicy,
): NetworkAccessPolicy {
  if (policy.mode === 'allow-all' || policy.mode === 'deny-all') {
    return { mode: policy.mode };
  }
  return {
    mode: 'custom',
    allowedHosts: [...policy.allowedHosts],
    allowedCIDRs: [...policy.allowedCIDRs],
    deniedCIDRs: [...policy.deniedCIDRs],
  };
}

function cloneNetworkPolicy(policy: NetworkPolicy): NetworkPolicy {
  return structuredClone(policy);
}

function cloneMatch(
  match: NonNullable<NetworkPolicyRule['match']>,
): NonNullable<NetworkPolicyRule['match']> {
  return {
    ...(match.path == null ? {} : { path: cloneMatcher(match.path) }),
    ...(match.method == null ? {} : { method: [...match.method] }),
    ...(match.queryString == null
      ? {}
      : { queryString: match.queryString.map(cloneKeyValueMatcher) }),
    ...(match.headers == null
      ? {}
      : { headers: match.headers.map(cloneKeyValueMatcher) }),
  };
}

function cloneKeyValueMatcher(
  matcher: NetworkPolicyKeyValueMatcher,
): NetworkPolicyKeyValueMatcher {
  return {
    ...(matcher.key == null ? {} : { key: cloneMatcher(matcher.key) }),
    ...(matcher.value == null ? {} : { value: cloneMatcher(matcher.value) }),
  };
}

function cloneMatcher(matcher: NetworkPolicyMatcher): NetworkPolicyMatcher {
  return { ...matcher };
}

function cloneHarnessKeyValueMatcher(
  matcher: NonNullable<
    HarnessV1RequestTransformation['match']['headers']
  >[number],
): NonNullable<HarnessV1RequestTransformation['match']['headers']>[number] {
  return {
    ...(matcher.key == null ? {} : { key: cloneHarnessMatcher(matcher.key) }),
    ...(matcher.value == null
      ? {}
      : { value: cloneHarnessMatcher(matcher.value) }),
  };
}

function cloneHarnessMatcher(
  matcher: NonNullable<HarnessV1RequestTransformation['match']['path']>,
): NonNullable<HarnessV1RequestTransformation['match']['path']> {
  if ('exact' in matcher) {
    return { exact: matcher.exact };
  }
  if ('startsWith' in matcher) {
    return { startsWith: matcher.startsWith };
  }
  return { regex: matcher.regex };
}

function createPolicyConflictError(
  message: string,
): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    harnessId: VERCEL_PROVIDER_ID,
    message,
  });
}
