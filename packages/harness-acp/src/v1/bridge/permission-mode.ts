import type { HarnessV1PermissionMode } from '@ai-sdk/harness';
import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import * as acp from '@agentclientprotocol/sdk';
import type {
  ACPPermissionModeMapping,
  ACPPermissionModeTarget,
} from '../acp-v1-settings';

const PERMISSION_MODES = [
  'allow-reads',
  'allow-edits',
  'allow-all',
] as const satisfies ReadonlyArray<HarnessV1PermissionMode>;

type ACPSessionConfiguration = Pick<
  acp.NewSessionResponse,
  'modes' | 'configOptions'
>;

export async function configureACPPermissionMode({
  agent,
  sessionId,
  sessionConfiguration,
  permissionModeMapping,
  permissionMode,
  harnessId,
}: {
  agent: acp.ClientContext;
  sessionId: string;
  sessionConfiguration: ACPSessionConfiguration;
  permissionModeMapping: ACPPermissionModeMapping;
  permissionMode: HarnessV1PermissionMode;
  harnessId: string;
}): Promise<void> {
  const target = permissionModeMapping[permissionMode];
  if (target == null) {
    throw unsupported({
      harnessId,
      message:
        `Permission mode ${JSON.stringify(permissionMode)} is not supported by this ACP harness.` +
        (permissionModeMapping['allow-all'] == null
          ? ''
          : ` Use permissionMode: 'allow-all'.`),
    });
  }

  for (const mappedPermissionMode of PERMISSION_MODES) {
    const mappedTarget = permissionModeMapping[mappedPermissionMode];
    if (mappedTarget != null) {
      validateTarget({
        target: mappedTarget,
        permissionMode: mappedPermissionMode,
        sessionConfiguration,
        harnessId,
      });
    }
  }

  if (target.type === 'session-mode') {
    await agent.request(acp.methods.agent.session.setMode, {
      sessionId,
      modeId: target.modeId,
    });
    return;
  }
  await agent.request(acp.methods.agent.session.setConfigOption, {
    sessionId,
    configId: target.configId,
    value: target.value,
    ...(typeof target.value === 'boolean' ? { type: 'boolean' as const } : {}),
  });
}

function validateTarget({
  target,
  permissionMode,
  sessionConfiguration,
  harnessId,
}: {
  target: ACPPermissionModeTarget;
  permissionMode: HarnessV1PermissionMode;
  sessionConfiguration: ACPSessionConfiguration;
  harnessId: string;
}): void {
  if (target.type === 'session-mode') {
    const availableModeIds =
      sessionConfiguration.modes?.availableModes.map(mode => mode.id) ?? [];
    if (!availableModeIds.includes(target.modeId)) {
      throw unsupported({
        harnessId,
        message:
          `ACP permission mapping for ${JSON.stringify(permissionMode)} requires session mode ` +
          `${JSON.stringify(target.modeId)}, but the agent advertised ` +
          `${formatChoices({ values: availableModeIds })}.`,
      });
    }
    return;
  }

  const configOption = sessionConfiguration.configOptions?.find(
    option => option.id === target.configId,
  );
  if (configOption == null) {
    const availableConfigIds =
      sessionConfiguration.configOptions?.map(option => option.id) ?? [];
    throw unsupported({
      harnessId,
      message:
        `ACP permission mapping for ${JSON.stringify(permissionMode)} requires session configuration ` +
        `${JSON.stringify(target.configId)}, but the agent advertised ` +
        `${formatChoices({ values: availableConfigIds })}.`,
    });
  }
  if (configOption.type === 'boolean') {
    if (typeof target.value !== 'boolean') {
      throw unsupported({
        harnessId,
        message:
          `ACP permission mapping for ${JSON.stringify(permissionMode)} assigns string value ` +
          `${JSON.stringify(target.value)} to boolean session configuration ${JSON.stringify(target.configId)}.`,
      });
    }
    return;
  }
  if (typeof target.value !== 'string') {
    throw unsupported({
      harnessId,
      message:
        `ACP permission mapping for ${JSON.stringify(permissionMode)} assigns boolean value ` +
        `${JSON.stringify(target.value)} to select session configuration ${JSON.stringify(target.configId)}.`,
    });
  }
  const availableValues = configOption.options.flatMap(option =>
    'options' in option
      ? option.options.map(value => value.value)
      : [option.value],
  );
  if (!availableValues.includes(target.value)) {
    throw unsupported({
      harnessId,
      message:
        `ACP permission mapping for ${JSON.stringify(permissionMode)} requires value ` +
        `${JSON.stringify(target.value)} for session configuration ${JSON.stringify(target.configId)}, ` +
        `but the agent advertised ${formatChoices({ values: availableValues })}.`,
    });
  }
}

function formatChoices({ values }: { values: ReadonlyArray<string> }): string {
  return values.length === 0
    ? 'no matching choices'
    : values.map(value => JSON.stringify(value)).join(', ');
}

function unsupported({
  harnessId,
  message,
}: {
  harnessId: string;
  message: string;
}): HarnessBridgeCapabilityUnsupportedError {
  return new HarnessBridgeCapabilityUnsupportedError({ harnessId, message });
}
