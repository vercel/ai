import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';

/**
 * Resolved endpoint for a port exposed by a sandbox session.
 */
export type HarnessV2PortEndpoint = {
  /**
   * Fully qualified URL for the port and requested protocol.
   */
  readonly url: string;

  /**
   * Headers required when connecting to the endpoint.
   */
  readonly headers?: Readonly<Record<string, string>>;
};

/**
 * Sandbox capabilities required by adapters that need network control.
 */
export interface HarnessV2NetworkSandboxSession extends SandboxSession {
  /**
   * Stable sandbox identifier used to reacquire the session.
   */
  readonly id: string;

  /**
   * Default working directory used for adapter commands and files.
   */
  readonly defaultWorkingDirectory: string;

  /**
   * Ports currently exposed by the sandbox.
   */
  readonly ports: ReadonlyArray<number>;

  /**
   * Resolves a port to its connection URL and any required request headers.
   */
  readonly getPortEndpoint: (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }) => PromiseLike<HarnessV2PortEndpoint>;

  /**
   * Resolves a port to a URL without returning endpoint headers.
   */
  readonly getPortUrl: (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }) => PromiseLike<string>;

  /**
   * Stops the sandbox while retaining its identity for a later restart.
   */
  readonly stop: () => PromiseLike<void>;

  /**
   * Permanently destroys the sandbox and its resources.
   */
  readonly destroy: () => PromiseLike<void>;

  /**
   * Replaces the sandbox's outbound network policy.
   */
  readonly setNetworkPolicy?: (
    policy: HarnessV2NetworkPolicy,
  ) => PromiseLike<void>;

  /**
   * Replaces the request transformations applied by the sandbox.
   */
  readonly setRequestTransformations?: (
    transformations: ReadonlyArray<HarnessV2RequestTransformation>,
  ) => PromiseLike<void>;

  /**
   * Adds request transformations without replacing existing ones.
   */
  readonly addRequestTransformations?: (
    transformations: ReadonlyArray<HarnessV2RequestTransformation>,
  ) => PromiseLike<void>;

  /**
   * Changes exposed ports, optionally aborting the operation.
   */
  readonly setPorts?: (
    ports: ReadonlyArray<number>,
    options?: { abortSignal?: AbortSignal },
  ) => PromiseLike<void>;

  /**
   * Returns the same session with its network access restricted.
   */
  readonly restricted: () => SandboxSession;
}

/**
 * Outbound network access policy applied to a sandbox.
 */
export type HarnessV2NetworkPolicy =
  | {
      /**
       * Allows all outbound connections.
       */
      mode: 'allow-all';
    }
  | {
      /**
       * Denies all outbound connections.
       */
      mode: 'deny-all';
    }
  | {
      /**
       * Allows hosts and optionally narrows or denies IP ranges.
       */
      mode: 'custom';

      /**
       * Hostnames allowed to receive outbound requests.
       */
      allowedHosts: ReadonlyArray<string>;

      /**
       * Additional IP ranges permitted by the policy.
       */
      allowedCIDRs?: ReadonlyArray<string>;

      /**
       * IP ranges explicitly denied by the policy.
       */
      deniedCIDRs?: ReadonlyArray<string>;
    }
  | {
      /**
       * Allows specified IP ranges and optionally specified hostnames.
       */
      mode: 'custom';

      /**
       * Hostnames allowed when host-based restrictions are needed.
       */
      allowedHosts?: ReadonlyArray<string>;

      /**
       * IP ranges that must be permitted by the policy.
       */
      allowedCIDRs: ReadonlyArray<string>;

      /**
       * IP ranges explicitly denied by the policy.
       */
      deniedCIDRs?: ReadonlyArray<string>;
    };

/**
 * Selects one path-matching strategy for a request transformation.
 */
type HarnessV2RequestTransformationPathMatcher =
  | {
      /**
       * Matches one exact request path.
       */
      exact: string;
    }
  | {
      /**
       * Matches request paths with this prefix.
       */
      startsWith: string;
    }
  | {
      /**
       * Matches request paths using this regular expression.
       */
      regex: string;
    };

/**
 * Selects one value-matching strategy for a query parameter or header.
 */
type HarnessV2RequestTransformationKeyValuePartMatcher =
  | {
      /**
       * Matches one exact query or header value.
       */
      exact: string;
    }
  | {
      /**
       * Matches query or header values with this prefix.
       */
      startsWith: string;
    }
  | {
      /**
       * Matches query or header values using this regular expression.
       */
      regex: string;
    };

/**
 * Optional key and value predicates for a query parameter or header.
 */
type HarnessV2RequestTransformationKeyValueMatcher = {
  /**
   * Predicate applied to the parameter or header name.
   */
  readonly key?: HarnessV2RequestTransformationKeyValuePartMatcher;

  /**
   * Predicate applied to the parameter or header value.
   */
  readonly value?: HarnessV2RequestTransformationKeyValuePartMatcher;
};

/**
 * Header rewrite applied to requests matching the supplied criteria.
 */
export type HarnessV2RequestTransformation = {
  /**
   * Request attributes that must match before applying the rewrite.
   */
  readonly match: {
    /**
     * Hostname the request must target.
     */
    readonly host: string;

    /**
     * Optional path predicate.
     */
    readonly path?: HarnessV2RequestTransformationPathMatcher;

    /**
     * Allowed HTTP methods; omitted to match every method.
     */
    readonly method?: ReadonlyArray<string>;

    /**
     * Query parameter predicates; all supplied predicates must match.
     */
    readonly queryString?: ReadonlyArray<HarnessV2RequestTransformationKeyValueMatcher>;

    /**
     * Header predicates; all supplied predicates must match.
     */
    readonly headers?: ReadonlyArray<HarnessV2RequestTransformationKeyValueMatcher>;
  };

  /**
   * Headers written to requests satisfying `match`.
   */
  readonly transform: {
    /**
     * Header values written when all request match criteria are satisfied.
     */
    readonly headers: Readonly<Record<string, string>>;
  };
};

/**
 * Environment and authentication inputs used to derive request rewrites.
 */
export type HarnessV2RequestTransformationSources<AuthenticationMode> = {
  /**
   * Environment variables available to the host.
   */
  env: Record<string, string>;

  /**
   * Environment variables available inside the sandbox.
   */
  sandboxEnv: Record<string, string>;

  /**
   * Authentication mode selected for the sandbox requests.
   */
  auth: AuthenticationMode;
};
