import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1RequestTransformation,
} from '@ai-sdk/harness';
import { createCredentialRequestTransformation } from '@ai-sdk/harness/utils';
import type { Sandbox } from 'modal';
import { describe, expect, it, vi } from 'vitest';
import {
  ModalRequestTransformationManager,
  assertRequestTransformationSettings,
  supportsRequestTransformations,
  toModalHeaderReplacements,
  withRequestTransformationSettings,
} from './modal-request-transformations';

const anthropicRule = createCredentialRequestTransformation({
  matchUrl: 'https://api.anthropic.com',
  matchHeaders: { 'x-api-key': 'aisdkhc_placeholder' },
  transformHeaders: { 'x-api-key': 'sk-ant-real' },
});

const openaiRule = createCredentialRequestTransformation({
  matchUrl: 'https://api.openai.com/v1',
  matchHeaders: { Authorization: 'Bearer aisdkhc_placeholder' },
  transformHeaders: { Authorization: 'Bearer sk-real' },
});

function rule(
  host: string,
  headers: Record<string, string>,
  match: Partial<HarnessV1RequestTransformation['match']> = {},
): HarnessV1RequestTransformation {
  return { match: { host, ...match }, transform: { headers } };
}

function catchError(operation: () => unknown): Error | undefined {
  try {
    operation();
  } catch (error) {
    return error as Error;
  }
}

describe('toModalHeaderReplacements', () => {
  it('applies a credential rule to its whole host', () => {
    expect(openaiRule.match).toEqual({
      host: 'api.openai.com',
      path: { startsWith: '/v1' },
      headers: [
        {
          key: { exact: 'Authorization' },
          value: { exact: 'Bearer aisdkhc_placeholder' },
        },
      ],
    });

    expect(toModalHeaderReplacements([anthropicRule, openaiRule])).toEqual([
      { domain: 'api.anthropic.com', headers: { 'x-api-key': 'sk-ant-real' } },
      {
        domain: 'api.openai.com',
        headers: { Authorization: 'Bearer sk-real' },
      },
    ]);
  });

  it('combines the rules for one host into one replacement', () => {
    expect(
      toModalHeaderReplacements([
        rule('API.example.com', { 'x-api-key': 'key' }),
        rule('api.example.com', { Authorization: 'Bearer token' }),
        rule('api.example.com', { AUTHORIZATION: 'Bearer token' }),
      ]),
    ).toEqual([
      {
        domain: 'api.example.com',
        headers: { 'x-api-key': 'key', Authorization: 'Bearer token' },
      },
    ]);
  });

  it('writes a literal dollar sign the way Modal expects it', () => {
    expect(
      toModalHeaderReplacements([
        rule('example.com', { 'x-token': 'a$b$$c$KEY' }),
      ]),
    ).toEqual([
      { domain: 'example.com', headers: { 'x-token': 'a$$b$$$$c$$KEY' } },
    ]);
  });

  it('leaves out a rule that sets no header', () => {
    expect(toModalHeaderReplacements([rule('example.com', {})])).toEqual([]);
    expect(toModalHeaderReplacements([])).toEqual([]);
  });

  it.each([
    { matcher: 'method', match: { method: ['POST'] } },
    {
      matcher: 'queryString',
      match: { queryString: [{ key: { exact: 'beta' } }] },
    },
  ])('rejects a rule with a $matcher matcher', ({ matcher, match }) => {
    const error = catchError(() =>
      toModalHeaderReplacements([
        rule('api.example.com', { 'x-api-key': 'key' }, match),
      ]),
    );

    expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
    expect(error?.message).toBe(
      `Modal applies a request transformation to every request to its host, so the transformation for "api.example.com" cannot be limited with a ${matcher} matcher. Only path and headers matchers are accepted, and they do not narrow the transformation: its headers are attached to every request the sandbox sends to that host, with or without the placeholder. A method or queryString matcher, or any other matcher Modal cannot express, is rejected.`,
    );
  });

  it('rejects a rule with a matcher it does not know', () => {
    expect(() =>
      toModalHeaderReplacements([
        rule('api.example.com', { 'x-api-key': 'key' }, {
          body: { exact: 'x' },
        } as never),
      ]),
    ).toThrow('cannot be limited with a body matcher');
  });

  it('rejects rules for one host that set a header to different values', () => {
    const error = catchError(() =>
      toModalHeaderReplacements([
        rule(
          'api.example.com',
          { Authorization: 'Bearer one' },
          { path: { startsWith: '/v1' } },
        ),
        rule(
          'api.example.com',
          { authorization: 'Bearer two' },
          { path: { startsWith: '/v2' } },
        ),
      ]),
    );

    expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
    expect(error?.message).toBe(
      'Modal holds one value per host and header for the whole sandbox session and applies it to every request to its host, so one call cannot set the "authorization" header to different values for "api.example.com" and "api.example.com". The most recently supplied value for a host and header is used by every harness session on the sandbox session, so credentials that must be kept apart need separate sandbox sessions.',
    );
  });

  it.each([
    ['*.example.com', 'api.example.com'],
    ['api.example.com', '*.example.com'],
    ['*.example.com', 'example.com'],
    ['*.example.com', '*.api.example.com'],
    ['*', 'api.example.com'],
  ])(
    'rejects conflicting values for the overlapping hosts %s and %s',
    (first, second) => {
      expect(() =>
        toModalHeaderReplacements([
          rule(first, { 'x-api-key': 'one' }),
          rule(second, { 'x-api-key': 'two' }),
        ]),
      ).toThrow(
        `one call cannot set the "x-api-key" header to different values for "${first}" and "${second}"`,
      );
    },
  );

  it('accepts overlapping hosts that do not disagree on a header', () => {
    expect(
      toModalHeaderReplacements([
        rule('*.example.com', { 'x-api-key': 'key' }),
        rule('api.example.com', { 'x-api-key': 'key' }),
        rule('api.example.com', { Authorization: 'Bearer token' }),
      ]),
    ).toEqual([
      { domain: '*.example.com', headers: { 'x-api-key': 'key' } },
      {
        domain: 'api.example.com',
        headers: { 'x-api-key': 'key', Authorization: 'Bearer token' },
      },
    ]);
  });

  it('accepts different values for hosts that do not overlap', () => {
    expect(
      toModalHeaderReplacements([
        rule('*.example.com', { 'x-api-key': 'one' }),
        rule('*.example.org', { 'x-api-key': 'two' }),
        rule('notexample.com', { 'x-api-key': 'three' }),
      ]),
    ).toHaveLength(3);
  });
});

describe('ModalRequestTransformationManager', () => {
  function makeManager(
    experimentalUpdateOutboundPolicy = vi.fn(async (_policy: unknown) => {}),
  ) {
    const manager = new ModalRequestTransformationManager({
      sandbox: { experimentalUpdateOutboundPolicy } as unknown as Sandbox,
    });
    const appliedReplacements = () =>
      experimentalUpdateOutboundPolicy.mock.calls.map(
        ([policy]) => (policy as MockOutboundPolicy).replacements,
      );
    return { manager, experimentalUpdateOutboundPolicy, appliedReplacements };
  }

  it('replaces the whole outbound policy with the given rules', async () => {
    const { manager, appliedReplacements } = makeManager();

    await manager.setRequestTransformations([anthropicRule]);
    await manager.setRequestTransformations([openaiRule]);
    await manager.setRequestTransformations([]);

    expect(appliedReplacements()).toEqual([
      [
        {
          domain: 'api.anthropic.com',
          headers: { 'x-api-key': 'sk-ant-real' },
        },
      ],
      [
        {
          domain: 'api.openai.com',
          headers: { Authorization: 'Bearer sk-real' },
        },
      ],
      [],
    ]);
  });

  it('adds rules to the ones it already manages', async () => {
    const { manager, appliedReplacements } = makeManager();

    await manager.addRequestTransformations([anthropicRule]);
    await manager.addRequestTransformations([openaiRule]);

    expect(appliedReplacements()[1]).toEqual([
      { domain: 'api.anthropic.com', headers: { 'x-api-key': 'sk-ant-real' } },
      {
        domain: 'api.openai.com',
        headers: { Authorization: 'Bearer sk-real' },
      },
    ]);
  });

  it('uses the most recently supplied value, whichever harness session supplies it', async () => {
    const { manager, appliedReplacements } = makeManager();
    const anthropicRuleFor = (placeholder: string, key: string) =>
      createCredentialRequestTransformation({
        matchUrl: 'https://api.anthropic.com',
        matchHeaders: { 'x-api-key': placeholder },
        transformHeaders: { 'x-api-key': key },
      });

    await manager.addRequestTransformations([
      anthropicRuleFor('aisdkhc_first', 'sk-ant-one'),
      openaiRule,
    ]);
    await manager.addRequestTransformations([
      anthropicRuleFor('aisdkhc_second', 'sk-ant-one'),
    ]);
    await manager.addRequestTransformations([
      anthropicRuleFor('aisdkhc_second', 'sk-ant-two'),
    ]);
    await manager.addRequestTransformations([
      anthropicRuleFor('aisdkhc_first', 'sk-ant-three'),
    ]);

    expect(appliedReplacements().map(replacements => replacements[0])).toEqual(
      ['sk-ant-one', 'sk-ant-one', 'sk-ant-two', 'sk-ant-three'].map(key => ({
        domain: 'api.anthropic.com',
        headers: { 'x-api-key': key },
      })),
    );
    expect(appliedReplacements()[3]).toEqual([
      {
        domain: 'api.anthropic.com',
        headers: { 'x-api-key': 'sk-ant-three' },
      },
      {
        domain: 'api.openai.com',
        headers: { Authorization: 'Bearer sk-real' },
      },
    ]);
  });

  it('replaces a managed value whatever the spelling of the host and header', async () => {
    const { manager, appliedReplacements } = makeManager();

    await manager.addRequestTransformations([
      rule('api.example.com', { Authorization: 'Bearer one' }),
    ]);
    await manager.addRequestTransformations([
      rule('API.example.com', { authorization: 'Bearer two' }),
    ]);

    expect(appliedReplacements()[1]).toEqual([
      { domain: 'api.example.com', headers: { Authorization: 'Bearer two' } },
    ]);
  });

  it('rejects conflicting values in one call and keeps the managed values', async () => {
    const { manager, experimentalUpdateOutboundPolicy, appliedReplacements } =
      makeManager();
    await manager.addRequestTransformations([anthropicRule]);

    const error = await manager
      .addRequestTransformations([
        rule('api.anthropic.com', { 'x-api-key': 'sk-ant-other' }),
        rule('*.anthropic.com', { 'x-api-key': 'sk-ant-another' }),
      ])
      .catch(error => error);

    expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
    expect(error.message).toBe(
      'Modal holds one value per host and header for the whole sandbox session and applies it to every request to its host, so one call cannot set the "x-api-key" header to different values for "api.anthropic.com" and "*.anthropic.com". The most recently supplied value for a host and header is used by every harness session on the sandbox session, so credentials that must be kept apart need separate sandbox sessions.',
    );
    expect(experimentalUpdateOutboundPolicy).toHaveBeenCalledOnce();

    await manager.addRequestTransformations([openaiRule]);
    expect(appliedReplacements()[1]).toEqual([
      { domain: 'api.anthropic.com', headers: { 'x-api-key': 'sk-ant-real' } },
      {
        domain: 'api.openai.com',
        headers: { Authorization: 'Bearer sk-real' },
      },
    ]);
  });

  it('rejects a value for a host that overlaps a managed host with a different value', async () => {
    const { manager, experimentalUpdateOutboundPolicy, appliedReplacements } =
      makeManager();
    await manager.addRequestTransformations([anthropicRule]);

    const error = await manager
      .addRequestTransformations([
        rule('*.anthropic.com', { 'X-Api-Key': 'sk-ant-other' }),
      ])
      .catch(error => error);

    expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
    expect(error.message).toBe(
      'Modal holds one value per host and header for the whole sandbox session and applies it to every request to its host, so the "X-Api-Key" header for "*.anthropic.com" cannot be set to a value that differs from the one held for the overlapping host "api.anthropic.com": which of the two Modal would apply is ambiguous. The most recently supplied value for a host and header is used by every harness session on the sandbox session, so credentials that must be kept apart need separate sandbox sessions.',
    );
    expect(experimentalUpdateOutboundPolicy).toHaveBeenCalledOnce();

    await manager.addRequestTransformations([
      rule('*.anthropic.com', { 'x-api-key': 'sk-ant-real' }),
      rule('*.anthropic.com', { Authorization: 'Bearer other' }),
    ]);
    expect(appliedReplacements()[1]).toEqual([
      { domain: 'api.anthropic.com', headers: { 'x-api-key': 'sk-ant-real' } },
      {
        domain: '*.anthropic.com',
        headers: { 'x-api-key': 'sk-ant-real', Authorization: 'Bearer other' },
      },
    ]);
  });

  it('refreshes overlapping hosts that hold one value together in one call', async () => {
    const { manager, appliedReplacements } = makeManager();
    const rulesFor = (key: string) => [
      rule('api.anthropic.com', { 'x-api-key': key }),
      rule('*.anthropic.com', { 'x-api-key': key }),
    ];

    await manager.addRequestTransformations(rulesFor('sk-ant-one'));
    await manager.addRequestTransformations(rulesFor('sk-ant-two'));

    expect(appliedReplacements()[1]).toEqual([
      { domain: 'api.anthropic.com', headers: { 'x-api-key': 'sk-ant-two' } },
      { domain: '*.anthropic.com', headers: { 'x-api-key': 'sk-ant-two' } },
    ]);
    await expect(
      manager.addRequestTransformations([
        rule('api.anthropic.com', { 'x-api-key': 'sk-ant-three' }),
      ]),
    ).rejects.toThrow(
      'cannot be set to a value that differs from the one held for the overlapping host "*.anthropic.com"',
    );
  });

  it('does not keep rules that Modal failed to apply', async () => {
    const failure = Object.assign(new Error('unavailable'), { code: 14 });
    const { manager, experimentalUpdateOutboundPolicy, appliedReplacements } =
      makeManager();
    experimentalUpdateOutboundPolicy.mockRejectedValueOnce(failure);

    await expect(
      manager.addRequestTransformations([anthropicRule]),
    ).rejects.toBe(failure);
    await manager.addRequestTransformations([openaiRule]);

    expect(appliedReplacements()[1]).toEqual([
      {
        domain: 'api.openai.com',
        headers: { Authorization: 'Bearer sk-real' },
      },
    ]);
  });

  it('applies concurrent mutations in the order they were made', async () => {
    const { manager, appliedReplacements } = makeManager();

    await Promise.all([
      manager.addRequestTransformations([anthropicRule]),
      manager.addRequestTransformations([openaiRule]),
      manager.setRequestTransformations([]),
    ]);

    expect(
      appliedReplacements().map(replacements => replacements.length),
    ).toEqual([1, 2, 0]);
  });

  it('does not share state with the rules it was given', async () => {
    const { manager, appliedReplacements } = makeManager();
    const headers = { 'x-api-key': 'original' };

    await manager.addRequestTransformations([
      { match: { host: 'example.com' }, transform: { headers } },
    ]);
    headers['x-api-key'] = 'changed';
    await manager.addRequestTransformations([openaiRule]);

    expect(appliedReplacements()[1][0]).toEqual({
      domain: 'example.com',
      headers: { 'x-api-key': 'original' },
    });
  });

  it('explains a sandbox that was created without an outbound policy', async () => {
    const refused = Object.assign(
      new Error(
        '/modal.task_command_router.TaskCommandRouter/TaskSetOutboundPolicy FAILED_PRECONDITION: secret injection is not enabled for this sandbox',
      ),
      { code: 9 },
    );
    const { manager } = makeManager(vi.fn().mockRejectedValue(refused));

    const error = await manager
      .addRequestTransformations([anthropicRule])
      .catch(error => error);

    expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
    expect(error.message).toContain('requestTransformations: true');
    expect(error.cause).toBe(refused);
  });

  it('surfaces a finished sandbox unchanged', async () => {
    const finished = Object.assign(
      new Error(
        'FAILED_PRECONDITION: Sandbox has already finished with status timeout',
      ),
      { code: 9 },
    );
    const { manager } = makeManager(vi.fn().mockRejectedValue(finished));

    await expect(
      manager.setRequestTransformations([anthropicRule]),
    ).rejects.toBe(finished);
  });
});

describe('request transformation settings', () => {
  it('adds an empty outbound policy and the tag, and drops the allowlists', () => {
    const createParams = withRequestTransformationSettings({
      timeoutMs: 60_000,
      encryptedPorts: [4000],
      tags: { team: 'ai' },
      outboundCidrAllowlist: ['0.0.0.0/0'],
      outboundDomainAllowlist: ['*'],
    });

    expect(createParams).toEqual({
      timeoutMs: 60_000,
      encryptedPorts: [4000],
      tags: { team: 'ai', 'ai-sdk-request-transformations': 'true' },
      experimentalOutboundPolicy: expect.any(MockOutboundPolicy),
    });
    expect(
      (createParams.experimentalOutboundPolicy as unknown as MockOutboundPolicy)
        .replacements,
    ).toEqual([]);
  });

  it.each([
    { blockNetwork: true },
    { outboundCidrAllowlist: ['10.0.0.0/8'] },
    { outboundCidrAllowlist: [] },
    { outboundDomainAllowlist: ['example.com'] },
  ])('rejects the network restriction %o', createParams => {
    expect(() =>
      assertRequestTransformationSettings({
        functionName: 'createModalNetworkSandboxSession',
        createParams,
      }),
    ).toThrow(
      'createModalNetworkSandboxSession: requestTransformations cannot be combined with blockNetwork, outboundCidrAllowlist, or outboundDomainAllowlist. Modal does not restrict the outbound HTTPS traffic of a sandbox that uses its outbound policy.',
    );
  });

  it('accepts open outbound access', () => {
    for (const createParams of [{}, { blockNetwork: false }]) {
      expect(() =>
        assertRequestTransformationSettings({
          functionName: 'createModalNetworkSandboxSession',
          createParams,
        }),
      ).not.toThrow();
    }
  });

  it('recognizes a sandbox by its tag', () => {
    expect(
      supportsRequestTransformations({
        'ai-sdk-request-transformations': 'true',
      }),
    ).toBe(true);
    expect(supportsRequestTransformations({ team: 'ai' })).toBe(false);
  });
});

type MockHeaderReplacement = {
  domain: string;
  headers: Record<string, string>;
};

type MockOutboundPolicy = {
  readonly replacements: ReadonlyArray<MockHeaderReplacement>;
};

const { MockOutboundPolicy } = vi.hoisted(() => ({
  MockOutboundPolicy: class MockOutboundPolicy {
    constructor(
      readonly replacements: ReadonlyArray<{
        domain: string;
        headers: Record<string, string>;
      }> = [],
    ) {}

    withHeaderReplacement(replacement: {
      domain: string;
      headers: Record<string, string>;
    }) {
      return new MockOutboundPolicy([...this.replacements, replacement]);
    }
  },
}));

vi.mock('modal', () => ({ ExperimentalOutboundPolicy: MockOutboundPolicy }));
