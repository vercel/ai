/**
 * Resolves the DNS domain suffix for a given AWS region based on its partition.
 *
 * Note: partition IDs (e.g. "aws-iso-b") differ from the region prefixes used
 * to identify them (e.g. "us-isob-"). The table below shows the mapping:
 *
 * | Name                        | Partition   | Region Prefix | DNS Suffix       |
 * |-----------------------------|-------------|---------------|------------------|
 * | AWS Standard                | aws         | us-, eu-, ... | amazonaws.com    |
 * | AWS China                   | aws-cn      | cn-           | amazonaws.com.cn |
 * | AWS GovCloud (US)           | aws-us-gov  | us-gov-       | amazonaws.com    |
 * | AWS ISO (US)                | aws-iso     | us-iso-       | c2s.ic.gov       |
 * | AWS ISOB (US)               | aws-iso-b   | us-isob-      | sc2s.sgov.gov    |
 * | AWS ISOE (Europe)           | aws-iso-e   | eu-isoe-      | cloud.adc-e.uk   |
 * | AWS ISOF                    | aws-iso-f   | us-isof-      | csp.hci.ic.gov   |
 *
 * Source (AWS SDK for JS v3 partition metadata):
 * https://github.com/aws/aws-sdk-js-v3/blob/main/packages-internal/util-endpoints/src/lib/aws/partitions.json
 */
export function resolvePartitionDomain(region: string): string {
  if (region.startsWith('cn-')) return 'amazonaws.com.cn';
  if (region.startsWith('us-isof-')) return 'csp.hci.ic.gov';
  if (region.startsWith('us-isob-')) return 'sc2s.sgov.gov';
  if (region.startsWith('us-iso-')) return 'c2s.ic.gov';
  if (region.startsWith('eu-isoe-')) return 'cloud.adc-e.uk';
  return 'amazonaws.com';
}
