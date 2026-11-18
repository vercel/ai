import type {
  RequestPermissionRequest,
  SessionUpdate,
} from '@agentclientprotocol/sdk';
import { readFileSync } from 'node:fs';

export function loadWeatherApprovalFixture({
  harness,
}: {
  harness: string;
}): Array<
  | { type: 'update'; value: SessionUpdate }
  | { type: 'permission'; value: RequestPermissionRequest }
> {
  return JSON.parse(
    readFileSync(
      new URL(
        `./${harness}-weather-approval.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  );
}

export function loadGrokBuildWeatherFixture(): Array<{
  type: 'update';
  value: SessionUpdate;
}> {
  return JSON.parse(
    readFileSync(new URL('./grok-build-weather.json', import.meta.url), 'utf8'),
  );
}
