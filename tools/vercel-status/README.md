# Vercel Status Monitoring Tools

This directory contains utilities for integrating Vercel's [Status Page](https://www.vercel-status.com/) into the AI SDK repository, enabling automatic detection and management of infrastructure incidents.

## Features

- **Status Checking**: Query Vercel's public API to check component status
- **Gateway Monitoring**: Detect when the AI Gateway is experiencing outages
- **GitHub Integration**: Automatically create, update, pin, and close issues for outages
- **Incident Tracking**: Monitor incident lifecycle from detection to resolution

## API Reference

### Vercel Status API

The Vercel Status Page provides a public JSON API (no authentication required):

```
https://www.vercel-status.com/api/v2/status.json      # Overall page status
https://www.vercel-status.com/api/v2/components.json  # Component statuses
https://www.vercel-status.com/api/v2/incidents.json   # Active incidents & history
```

## Usage

### Basic Status Checking

```typescript
import { checkGatewayOutageStatus, getActiveGatewayIncidents } from './status-checker';

// Check if Gateway is experiencing an outage
const status = await checkGatewayOutageStatus();

if (status.isOutage) {
  console.log('Gateway outage detected!');
  console.log('Active incidents:', status.activeIncidents);
}
```

### Monitoring Status Changes

```typescript
import { monitorGatewayStatus } from './status-checker';

// Set up monitoring with a callback
const unsubscribe = monitorGatewayStatus(
  async (status) => {
    if (status.isOutage) {
      console.log('Outage started or ongoing');
    } else {
      console.log('Service operational');
    }
  },
  60000 // Check every 60 seconds
);

// Stop monitoring when done
unsubscribe();
```

### GitHub Issue Management

```typescript
import { OutageManager } from './github-integration';
import { getActiveGatewayIncidents } from './status-checker';

const manager = new OutageManager({
  owner: 'vercel',
  repo: 'ai',
  githubToken: process.env.GITHUB_TOKEN!,
});

// Check for incidents and manage issues
const incidents = await getActiveGatewayIncidents();
for (const incident of incidents) {
  await manager.handleIncident(incident);
}

// Get the current issue number (if any)
const issueNumber = manager.getCurrentIssueNumber();
```

### Complete Outage Handling Flow

```typescript
import { checkGatewayOutageStatus } from './status-checker';
import { OutageManager } from './github-integration';

const manager = new OutageManager({
  owner: 'vercel',
  repo: 'ai',
  githubToken: process.env.GITHUB_TOKEN!,
  onError: (error) => console.error('Outage management error:', error),
});

// Monitor Gateway status continuously
const unsubscribe = monitorGatewayStatus(
  async (status) => {
    if (status.activeIncidents.length > 0) {
      // Process each active incident
      for (const incident of status.activeIncidents) {
        await manager.handleIncident(incident);
      }
    }
  },
  60000 // Poll every minute
);
```

## API Components

### status-checker.ts

**Main Functions:**

- `getPageStatus()` - Get overall Vercel status
- `getComponents()` - List all components with status
- `getIncidents()` - Get all incidents (active and resolved)
- `findGatewayComponent()` - Find the AI Gateway component
- `isGatewayOperational()` - Check if Gateway is operational
- `getActiveGatewayIncidents()` - Get incidents affecting the Gateway
- `checkGatewayOutageStatus()` - Comprehensive outage status check
- `monitorGatewayStatus(callback, interval)` - Poll status with callback

**Types:**

- `PageStatus` - Overall system status
- `Component` - Individual service component
- `Incident` - Infrastructure incident
- `IncidentUpdate` - Update to an incident
- `GatewayOutageStatus` - Complete outage status

### github-integration.ts

**Main Functions:**

- `createOutageIssue()` - Create a new issue for an outage
- `updateOutageIssue()` - Update existing issue with new info
- `closeOutageIssue()` - Close a resolved outage issue
- `pinIssue()` - Pin issue to repository
- `unpinIssue()` - Unpin issue from repository
- `findExistingOutageIssue()` - Search for open outage issues

**Main Class:**

- `OutageManager` - Orchestrates the complete incident lifecycle
  - Detects new incidents
  - Creates/updates GitHub issues
  - Pins/unpins issues
  - Closes issues when resolved

## Integration with AGENTS.md

The AGENTS.md file has been updated with instructions for agents to:

1. **Check Vercel Status** when debugging sudden errors without code changes
2. **Use the Status API** to determine if infrastructure is affected
3. **Handle Gateway Outages** by creating tracked issues

See the "Vercel Status Monitoring" section in AGENTS.md for details.

## Environment Variables

To use the GitHub integration, provide:

- `GITHUB_TOKEN` - GitHub API token with repository access

## Error Handling

All functions throw errors on API failures. Wrap calls in try-catch:

```typescript
try {
  const status = await checkGatewayOutageStatus();
} catch (error) {
  console.error('Status check failed:', error);
  // Gracefully handle: assume service is operational
}
```

The `OutageManager` supports an optional `onError` callback to handle errors without throwing:

```typescript
const manager = new OutageManager({
  // ... other options
  onError: (error) => {
    console.error('Error managing incident:', error);
    // Handle error without crashing
  },
});
```

## References

- **Vercel Status Page**: https://www.vercel-status.com/
- **Status Page Platform**: Built on Atlassian Statuspage
- **GitHub API Docs**: https://docs.github.com/en/rest
