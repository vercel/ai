import { AwsV4Signer } from 'aws4fetch';

export interface SigningOptions {
  region: string;
  service: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export interface SigningRequest {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  body: unknown;
}

/**
 * A class that can sign requests for Amazon Bedrock using AWS Signature Version 4.
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html|AWS SigV4 Documentation}
 */
export class AwsSigV4Signer {
  constructor(readonly options: SigningOptions) {}

  /**
   * Sign a request for Amazon Bedrock using AWS Signature Version 4.
   *
   * @param request - The request to sign.
   * @returns Headers for the signed request.
   */
  async signRequest(
    request: SigningRequest,
  ): Promise<Record<string, string | undefined>> {
    console.log('signRequest: request=', JSON.stringify(request, null, 2));
    const signer = new AwsV4Signer({
      url: request.url,
      method: request.method,
      headers: Object.entries(request.headers).filter(
        ([_, v]) => v !== undefined,
      ) as [string, string][],
      body: request.body as string,
      ...this.options.credentials,
      service: this.options.service,
      region: this.options.region,
      allHeaders: true,
    });
    const result = await signer.sign();
    const headers: Record<string, string | undefined> = {};
    result.headers.forEach((v, k) => (headers[k] = v));
    return headers;
  }
}
