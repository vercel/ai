import { ProviderMetadata } from '../types/provider-metadata';
import { ProviderReference } from '../types/provider-reference';
import { Warning } from '../types/warning';

export interface UploadFileResult {
  readonly providerReference: ProviderReference;
  readonly providerMetadata?: ProviderMetadata;
  readonly warnings: Array<Warning>;
}
