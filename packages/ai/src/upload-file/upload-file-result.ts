import { ProviderMetadata } from '../types/provider-metadata';
import { ProviderReference } from '../types/provider-reference';

export interface UploadFileResult {
  readonly providerReference: ProviderReference;
  readonly providerMetadata?: ProviderMetadata;
}
