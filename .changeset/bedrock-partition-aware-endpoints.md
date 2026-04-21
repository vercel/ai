---
'@ai-sdk/amazon-bedrock': patch
---

feat(amazon-bedrock): add partition-aware endpoint resolution

Add resolvePartitionDomain() helper that maps AWS region prefixes to the correct DNS suffix for all 7 AWS partitions (aws, aws-cn, aws-us-gov, aws-iso, aws-iso-b, aws-iso-e, aws-iso-f). Previously the provider hardcoded amazonaws.com, which fails in ISO and other non-standard partitions.
