import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';

export type HarnessV2PortEndpoint = {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
};

export interface HarnessV2NetworkSandboxSession extends SandboxSession {
  readonly id: string;
  readonly defaultWorkingDirectory: string;
  readonly ports: ReadonlyArray<number>;
  readonly getPortEndpoint: (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }) => PromiseLike<HarnessV2PortEndpoint>;
  readonly getPortUrl: (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }) => PromiseLike<string>;
  readonly stop: () => PromiseLike<void>;
  readonly destroy: () => PromiseLike<void>;
  readonly setNetworkPolicy?: (
    policy: HarnessV2NetworkPolicy,
  ) => PromiseLike<void>;
  readonly setRequestTransformations?: (
    transformations: ReadonlyArray<HarnessV2RequestTransformation>,
  ) => PromiseLike<void>;
  readonly addRequestTransformations?: (
    transformations: ReadonlyArray<HarnessV2RequestTransformation>,
  ) => PromiseLike<void>;
  readonly setPorts?: (
    ports: ReadonlyArray<number>,
    options?: { abortSignal?: AbortSignal },
  ) => PromiseLike<void>;
  readonly restricted: () => SandboxSession;
}

export type HarnessV2NetworkPolicy =
  | { mode: 'allow-all' }
  | { mode: 'deny-all' }
  | {
      mode: 'custom';
      allowedHosts: ReadonlyArray<string>;
      allowedCIDRs?: ReadonlyArray<string>;
      deniedCIDRs?: ReadonlyArray<string>;
    }
  | {
      mode: 'custom';
      allowedHosts?: ReadonlyArray<string>;
      allowedCIDRs: ReadonlyArray<string>;
      deniedCIDRs?: ReadonlyArray<string>;
    };

type HarnessV2RequestTransformationPathMatcher =
  | { exact: string }
  | { startsWith: string }
  | { regex: string };

type HarnessV2RequestTransformationKeyValuePartMatcher =
  | { exact: string }
  | { startsWith: string }
  | { regex: string };

type HarnessV2RequestTransformationKeyValueMatcher = {
  readonly key?: HarnessV2RequestTransformationKeyValuePartMatcher;
  readonly value?: HarnessV2RequestTransformationKeyValuePartMatcher;
};

export type HarnessV2RequestTransformation = {
  readonly match: {
    readonly host: string;
    readonly path?: HarnessV2RequestTransformationPathMatcher;
    readonly method?: ReadonlyArray<string>;
    readonly queryString?: ReadonlyArray<HarnessV2RequestTransformationKeyValueMatcher>;
    readonly headers?: ReadonlyArray<HarnessV2RequestTransformationKeyValueMatcher>;
  };
  readonly transform: {
    readonly headers: Readonly<Record<string, string>>;
  };
};

export type HarnessV2RequestTransformationSources<AuthenticationMode> = {
  env: Record<string, string>;
  sandboxEnv: Record<string, string>;
  auth: AuthenticationMode;
};
