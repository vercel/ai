import { describe, it, expect } from 'vitest';
import { resolvePartitionDomain } from './bedrock-partition';

describe('resolvePartitionDomain', () => {
  it('should return amazonaws.com for standard commercial regions', () => {
    expect(resolvePartitionDomain('us-east-1')).toBe('amazonaws.com');
    expect(resolvePartitionDomain('us-west-2')).toBe('amazonaws.com');
    expect(resolvePartitionDomain('eu-west-1')).toBe('amazonaws.com');
    expect(resolvePartitionDomain('ap-southeast-1')).toBe('amazonaws.com');
  });

  it('should return amazonaws.com for GovCloud regions', () => {
    expect(resolvePartitionDomain('us-gov-west-1')).toBe('amazonaws.com');
    expect(resolvePartitionDomain('us-gov-east-1')).toBe('amazonaws.com');
  });

  it('should return amazonaws.com.cn for China regions', () => {
    expect(resolvePartitionDomain('cn-north-1')).toBe('amazonaws.com.cn');
    expect(resolvePartitionDomain('cn-northwest-1')).toBe('amazonaws.com.cn');
  });

  it('should return c2s.ic.gov for aws-iso regions', () => {
    expect(resolvePartitionDomain('us-iso-east-1')).toBe('c2s.ic.gov');
    expect(resolvePartitionDomain('us-iso-west-1')).toBe('c2s.ic.gov');
  });

  it('should return sc2s.sgov.gov for aws-iso-b regions', () => {
    expect(resolvePartitionDomain('us-isob-east-1')).toBe('sc2s.sgov.gov');
    expect(resolvePartitionDomain('us-isob-west-1')).toBe('sc2s.sgov.gov');
  });

  it('should return cloud.adc-e.uk for aws-iso-e regions', () => {
    expect(resolvePartitionDomain('eu-isoe-west-1')).toBe('cloud.adc-e.uk');
  });

  it('should return csp.hci.ic.gov for aws-iso-f regions', () => {
    expect(resolvePartitionDomain('us-isof-east-1')).toBe('csp.hci.ic.gov');
    expect(resolvePartitionDomain('us-isof-south-1')).toBe('csp.hci.ic.gov');
  });
});
