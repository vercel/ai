import type {
  HarnessV1RequestTransformation,
  HarnessV1NetworkPolicy,
} from '@ai-sdk/harness';
import type {
  NetworkPolicy,
  NetworkPolicyRule,
  Sandbox,
} from '@vercel/sandbox';
import { describe, expect, it, vi } from 'vitest';
import { VercelNetworkPolicyManager } from './vercel-network-policy-manager';

const credentialTransformation = {
  match: {
    host: 'api.example.com',
    method: ['POST'],
    path: { startsWith: '/v1/' },
  },
  transform: {
    headers: { authorization: 'Bearer managed-secret' },
  },
} as const satisfies HarnessV1RequestTransformation;

const secondTransformation = {
  match: {
    host: 'api.example.com',
    path: { exact: '/models' },
  },
  transform: {
    headers: { 'x-api-key': 'second-secret' },
  },
} as const satisfies HarnessV1RequestTransformation;

function makeManager({
  networkPolicy,
  update,
}: {
  networkPolicy?: NetworkPolicy;
  update?: ReturnType<typeof vi.fn>;
} = {}) {
  const updateMock = update ?? vi.fn(async () => {});
  const sandbox = {
    currentSession: () => ({ networkPolicy }),
    update: updateMock,
  } as unknown as Sandbox;
  return {
    manager: new VercelNetworkPolicyManager({ sandbox }),
    update: updateMock,
  };
}

function getLastNetworkPolicy(
  update: ReturnType<typeof vi.fn>,
): NetworkPolicy | undefined {
  return update.mock.calls.at(-1)?.[0]?.networkPolicy;
}

function makeRedactedPolicy({
  host = 'api.example.com',
  path = { startsWith: '/v1/' },
  headerName = 'authorization',
  count = 1,
  forwardURL,
}: {
  host?: string;
  path?: NonNullable<NetworkPolicyRule['match']>['path'];
  headerName?: string;
  count?: number;
  forwardURL?: string;
} = {}): NetworkPolicy {
  return {
    allow: {
      [host]: [
        ...Array.from({ length: count }, () => ({
          match: { method: ['POST'], path },
          transform: [{ headers: { [headerName]: '<redacted>' } }],
        })),
        ...(forwardURL == null ? [] : [{ forwardURL }]),
      ],
    },
  };
}

describe('VercelNetworkPolicyManager', () => {
  it('replaces request transformations with setRequestTransformations', async () => {
    const { manager, update } = makeManager();

    await manager.setRequestTransformations([credentialTransformation]);
    await manager.setRequestTransformations([secondTransformation]);

    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        '*': [],
        'api.example.com': [
          {
            match: { path: { exact: '/models' } },
            transform: [{ headers: { 'x-api-key': 'second-secret' } }],
          },
        ],
      },
    });
  });

  it('adds to transformations previously set or added', async () => {
    const { manager, update } = makeManager();
    const thirdTransformation = {
      match: { host: 'api.example.com', path: { exact: '/usage' } },
      transform: { headers: { 'x-usage-key': 'third-secret' } },
    } as const;

    await manager.setRequestTransformations([credentialTransformation]);
    await manager.addRequestTransformations([secondTransformation]);
    await manager.addRequestTransformations([thirdTransformation]);

    const policy = getLastNetworkPolicy(update);
    expect(policy).not.toBe('allow-all');
    expect(policy).not.toBe('deny-all');
    expect(
      policy != null &&
        policy !== 'allow-all' &&
        policy !== 'deny-all' &&
        !Array.isArray(policy.allow)
        ? policy.allow?.['api.example.com']
        : undefined,
    ).toHaveLength(3);
  });

  it('replaces an already managed transformation with the same match and headers', async () => {
    const { manager, update } = makeManager();
    const refreshedTransformation = {
      ...credentialTransformation,
      transform: {
        headers: { authorization: 'Bearer refreshed-secret' },
      },
    } as const satisfies HarnessV1RequestTransformation;

    await manager.addRequestTransformations([credentialTransformation]);
    await manager.addRequestTransformations([refreshedTransformation]);

    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        '*': [],
        'api.example.com': [
          {
            match: {
              method: ['POST'],
              path: { startsWith: '/v1/' },
            },
            transform: [
              { headers: { authorization: 'Bearer refreshed-secret' } },
            ],
          },
        ],
      },
    });
  });

  it('does not update the policy when adding the same transformation twice', async () => {
    const { manager, update } = makeManager();

    await manager.addRequestTransformations([credentialTransformation]);
    await manager.addRequestTransformations([credentialTransformation]);

    expect(update).toHaveBeenCalledOnce();
  });

  it('preserves forwarding rules across every policy operation and merges same-host values', async () => {
    const { manager, update } = makeManager({
      networkPolicy: {
        allow: {
          'api.example.com': [
            {
              match: { path: { startsWith: '/proxy/' } },
              forwardURL: 'https://proxy.example.com',
            },
          ],
        },
      },
    });

    await manager.addRequestTransformations([credentialTransformation]);
    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        'api.example.com': [
          {
            match: {
              method: ['POST'],
              path: { startsWith: '/v1/' },
            },
            transform: [
              { headers: { authorization: 'Bearer managed-secret' } },
            ],
          },
          {
            match: { path: { startsWith: '/proxy/' } },
            forwardURL: 'https://proxy.example.com',
          },
        ],
      },
    });

    await manager.setNetworkPolicy({
      mode: 'custom',
      allowedHosts: ['api.example.com', 'registry.npmjs.org'],
    });
    await manager.setRequestTransformations([secondTransformation]);

    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        'api.example.com': [
          {
            match: { path: { exact: '/models' } },
            transform: [{ headers: { 'x-api-key': 'second-secret' } }],
          },
          {
            match: { path: { startsWith: '/proxy/' } },
            forwardURL: 'https://proxy.example.com',
          },
        ],
        'registry.npmjs.org': [],
      },
    });
  });

  it('keeps transformations pending while access denies their hosts and activates them later', async () => {
    const { manager, update } = makeManager({ networkPolicy: 'deny-all' });
    const registryTransformation = {
      match: { host: 'registry.npmjs.org' },
      transform: { headers: { 'x-registry-key': 'registry-secret' } },
    } as const;

    await manager.setRequestTransformations([credentialTransformation]);
    await manager.addRequestTransformations([registryTransformation]);
    expect(update).not.toHaveBeenCalled();

    await manager.setNetworkPolicy({
      mode: 'custom',
      allowedHosts: ['api.example.com'],
    });
    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        'api.example.com': [
          {
            match: {
              method: ['POST'],
              path: { startsWith: '/v1/' },
            },
            transform: [
              { headers: { authorization: 'Bearer managed-secret' } },
            ],
          },
        ],
      },
    });

    await manager.setNetworkPolicy({ mode: 'allow-all' });
    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        '*': [],
        'api.example.com': expect.any(Array),
        'registry.npmjs.org': expect.any(Array),
      },
    });

    await manager.setNetworkPolicy({ mode: 'deny-all' });
    expect(getLastNetworkPolicy(update)).toBe('deny-all');

    await manager.setNetworkPolicy({
      mode: 'custom',
      allowedHosts: ['registry.npmjs.org'],
    });
    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        'registry.npmjs.org': [
          {
            transform: [{ headers: { 'x-registry-key': 'registry-secret' } }],
          },
        ],
      },
    });
  });

  it('intersects exact and wildcard host rules without widening access', async () => {
    const { manager, update } = makeManager();
    await manager.setRequestTransformations([
      credentialTransformation,
      {
        match: { host: '*.sub.example.com' },
        transform: { headers: { 'x-sub-key': 'sub-secret' } },
      },
      {
        match: { host: 'outside.example.net' },
        transform: { headers: { 'x-outside-key': 'outside-secret' } },
      },
    ]);

    await manager.setNetworkPolicy({
      mode: 'custom',
      allowedHosts: ['*.example.com'],
    });

    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        '*.example.com': [],
        'api.example.com': [
          {
            match: {
              method: ['POST'],
              path: { startsWith: '/v1/' },
            },
            transform: [
              { headers: { authorization: 'Bearer managed-secret' } },
            ],
          },
        ],
        '*.sub.example.com': [
          {
            transform: [{ headers: { 'x-sub-key': 'sub-secret' } }],
          },
        ],
      },
    });
  });

  it('does not activate hostname rules for CIDR-only access', async () => {
    const { manager, update } = makeManager({ networkPolicy: 'deny-all' });
    await manager.addRequestTransformations([credentialTransformation]);

    await manager.setNetworkPolicy({
      mode: 'custom',
      allowedCIDRs: ['10.0.0.0/8'],
      deniedCIDRs: ['10.5.0.0/16'],
    });

    expect(getLastNetworkPolicy(update)).toEqual({
      subnets: {
        allow: ['10.0.0.0/8'],
        deny: ['10.5.0.0/16'],
      },
    });
  });

  it('reconstructs and preserves the initial hostname and subnet access policy', async () => {
    const { manager, update } = makeManager({
      networkPolicy: {
        allow: ['api.example.com'],
        subnets: {
          allow: ['10.0.0.0/8'],
          deny: ['10.5.0.0/16'],
        },
      },
    });

    await manager.setRequestTransformations([credentialTransformation]);

    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        'api.example.com': [
          {
            match: {
              method: ['POST'],
              path: { startsWith: '/v1/' },
            },
            transform: [
              { headers: { authorization: 'Bearer managed-secret' } },
            ],
          },
        ],
      },
      subnets: {
        allow: ['10.0.0.0/8'],
        deny: ['10.5.0.0/16'],
      },
    });
  });

  it('rehydrates matching redacted transformations and allows additional pending rules', async () => {
    const { manager, update } = makeManager({
      networkPolicy: makeRedactedPolicy(),
    });
    const pendingTransformation = {
      match: { host: 'pending.example.com' },
      transform: { headers: { 'x-pending-key': 'pending-secret' } },
    } as const;

    await manager.addRequestTransformations([
      credentialTransformation,
      pendingTransformation,
    ]);

    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        'api.example.com': [
          {
            match: {
              method: ['POST'],
              path: { startsWith: '/v1/' },
            },
            transform: [
              { headers: { authorization: 'Bearer managed-secret' } },
            ],
          },
        ],
      },
    });
  });

  it('rehydrates a wildcard transformation materialized under a narrower allowed host', async () => {
    const { manager, update } = makeManager({
      networkPolicy: makeRedactedPolicy(),
    });

    await manager.addRequestTransformations([
      {
        ...credentialTransformation,
        match: {
          ...credentialTransformation.match,
          host: '*.example.com',
        },
      },
    ]);

    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        'api.example.com': [
          {
            match: {
              method: ['POST'],
              path: { startsWith: '/v1/' },
            },
            transform: [
              { headers: { authorization: 'Bearer managed-secret' } },
            ],
          },
        ],
      },
    });
  });

  it.each([
    {
      name: 'matcher',
      policy: makeRedactedPolicy(),
      transformations: [
        {
          ...credentialTransformation,
          match: {
            ...credentialTransformation.match,
            path: { exact: '/v1/chat' },
          },
        },
      ],
    },
    {
      name: 'header name',
      policy: makeRedactedPolicy(),
      transformations: [
        {
          ...credentialTransformation,
          transform: { headers: { 'x-api-key': 'secret' } },
        },
      ],
    },
    {
      name: 'multiplicity',
      policy: makeRedactedPolicy({ count: 2 }),
      transformations: [credentialTransformation],
    },
  ])(
    'rehydrates same-host redacted transformations despite unmatched $name',
    async ({ policy, transformations }) => {
      const { manager, update } = makeManager({ networkPolicy: policy });

      await expect(
        manager.addRequestTransformations(transformations),
      ).resolves.toBeUndefined();
      expect(update).toHaveBeenCalledOnce();
    },
  );

  it('rejects redacted transformations for a host absent from the incoming transformations', async () => {
    const { manager, update } = makeManager({
      networkPolicy: makeRedactedPolicy(),
    });

    await expect(
      manager.addRequestTransformations([
        {
          ...credentialTransformation,
          match: { ...credentialTransformation.match, host: 'other.test' },
        },
      ]),
    ).rejects.toThrow(/cannot be attributed/);
    expect(update).not.toHaveBeenCalled();
  });

  it('blocks an initial network policy change when redacted transformations exist', async () => {
    const { manager, update } = makeManager({
      networkPolicy: makeRedactedPolicy(),
    });

    await expect(
      manager.setNetworkPolicy({ mode: 'allow-all' }),
    ).rejects.toThrow(/redacted values cannot be preserved/);
    expect(update).not.toHaveBeenCalled();
  });

  it('allows setRequestTransformations to replace redacted transformations explicitly', async () => {
    const { manager, update } = makeManager({
      networkPolicy: makeRedactedPolicy({
        forwardURL: 'https://proxy.example.com',
      }),
    });

    await manager.setRequestTransformations([secondTransformation]);

    expect(getLastNetworkPolicy(update)).toEqual({
      allow: {
        'api.example.com': [
          {
            match: { path: { exact: '/models' } },
            transform: [{ headers: { 'x-api-key': 'second-secret' } }],
          },
          { forwardURL: 'https://proxy.example.com' },
        ],
      },
    });
  });

  it('keeps queued operations in FIFO order', async () => {
    let resolveFirstUpdate: (() => void) | undefined;
    const update = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveFirstUpdate = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const { manager } = makeManager({ update });
    const firstPolicy = {
      mode: 'custom',
      allowedHosts: ['first.example.com'],
    } as const satisfies HarnessV1NetworkPolicy;
    const secondPolicy = {
      mode: 'custom',
      allowedHosts: ['second.example.com'],
    } as const satisfies HarnessV1NetworkPolicy;

    const first = manager.setNetworkPolicy(firstPolicy);
    const second = manager.setNetworkPolicy(secondPolicy);
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));

    resolveFirstUpdate?.();
    await Promise.all([first, second]);

    expect(update.mock.calls.map(call => call[0].networkPolicy)).toEqual([
      { allow: ['first.example.com'] },
      { allow: ['second.example.com'] },
    ]);
  });

  it('does not commit failed updates and continues processing later operations', async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new Error('update failed'))
      .mockResolvedValueOnce(undefined);
    const { manager } = makeManager({ update });

    const first = manager.setNetworkPolicy({
      mode: 'custom',
      allowedHosts: ['first.example.com'],
    });
    const second = manager.setNetworkPolicy({
      mode: 'custom',
      allowedHosts: ['second.example.com'],
    });

    await expect(first).rejects.toThrow('update failed');
    await expect(second).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(2);
    expect(getLastNetworkPolicy(update)).toEqual({
      allow: ['second.example.com'],
    });
  });
});
