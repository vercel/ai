# Quick Start Guide - Vercel Status Monitoring

## 30-Second Overview

Three main use cases:

### 1. Check if Gateway is Down (Fastest)

```typescript
import { checkGatewayOutageStatus } from './tools/vercel-status/status-checker';

const status = await checkGatewayOutageStatus();
console.log(status.isOutage); // true if Gateway is down
```

### 2. Get Details About Outage

```typescript
import { getActiveGatewayIncidents, getLatestIncidentUpdate } from './tools/vercel-status/status-checker';

const incidents = await getActiveGatewayIncidents();
incidents.forEach(incident => {
  const latest = getLatestIncidentUpdate(incident);
  console.log(incident.name, incident.status, latest?.body);
});
```

### 3. Create/Update GitHub Issue (Requires GITHUB_TOKEN)

```typescript
import { OutageManager } from './tools/vercel-status/github-integration';
import { getActiveGatewayIncidents } from './tools/vercel-status/status-checker';

const manager = new OutageManager({
  owner: 'vercel',
  repo: 'ai',
  githubToken: process.env.GITHUB_TOKEN!,
});

for (const incident of await getActiveGatewayIncidents()) {
  await manager.handleIncident(incident);
}
```

## Common Tasks

### Task: Check if an error is infrastructure-related

```typescript
import { checkGatewayOutageStatus } from './tools/vercel-status/status-checker';

try {
  const status = await checkGatewayOutageStatus();
  
  if (status.isOutage) {
    console.log('Error is infrastructure-related:');
    console.log(status.activeIncidents[0]?.name);
  } else {
    console.log('Infrastructure is operational - check your code');
  }
} catch (error) {
  console.log('Could not check status - assume operational');
}
```

### Task: Monitor for outages (every 1 minute)

```typescript
import { monitorGatewayStatus } from './tools/vercel-status/status-checker';

const unsubscribe = monitorGatewayStatus(
  (status) => {
    if (status.isOutage) {
      console.log('OUTAGE DETECTED:', status.activeIncidents[0]?.name);
      // Send alert, create issue, etc.
    }
  },
  60000 // Check every 60 seconds
);

// Stop monitoring later with:
// unsubscribe();
```

### Task: Create a GitHub issue for an outage

```typescript
import { createOutageIssue } from './tools/vercel-status/github-integration';
import { getActiveGatewayIncidents } from './tools/vercel-status/status-checker';

const incident = (await getActiveGatewayIncidents())[0];

const issue = await createOutageIssue(incident, {
  owner: 'vercel',
  repo: 'ai',
  githubToken: process.env.GITHUB_TOKEN!,
});

console.log(`Created issue #${issue.number}`);
```

### Task: Pin/Unpin a GitHub issue

```typescript
import { pinIssue, unpinIssue } from './tools/vercel-status/github-integration';

// Pin
await pinIssue(42, {
  owner: 'vercel',
  repo: 'ai',
  githubToken: process.env.GITHUB_TOKEN!,
});

// Unpin
await unpinIssue(42, {
  owner: 'vercel',
  repo: 'ai',
  githubToken: process.env.GITHUB_TOKEN!,
});
```

### Task: Close an outage issue

```typescript
import { closeOutageIssue } from './tools/vercel-status/github-integration';

await closeOutageIssue(42, {
  owner: 'vercel',
  repo: 'ai',
  githubToken: process.env.GITHUB_TOKEN!,
});
```

## API Endpoints

```
Status:     https://www.vercel-status.com/api/v2/status.json
Components: https://www.vercel-status.com/api/v2/components.json
Incidents:  https://www.vercel-status.com/api/v2/incidents.json
```

No authentication required!

## Status Values

**Overall**: `none` | `minor` | `major` | `critical`

**Component**: `operational` | `degraded_performance` | `partial_outage` | `major_outage`

**Incident**: `investigating` | `identified` | `monitoring` | `resolved`

## Error Handling

```typescript
try {
  const status = await checkGatewayOutageStatus();
} catch (error) {
  // Network error, API down, invalid response
  console.error('Could not check status:', error);
  // Gracefully degrade: assume operational
}
```

## Running Examples

```bash
# Example 1: Quick status check
pnpm tsx tools/vercel-status/example-usage.ts 1

# Example 2: Create GitHub issue (requires GITHUB_TOKEN)
GITHUB_TOKEN=<token> pnpm tsx tools/vercel-status/example-usage.ts 2

# Example 3: Monitor for 30 seconds
pnpm tsx tools/vercel-status/example-usage.ts 3

# Example 4: Format incident details
pnpm tsx tools/vercel-status/example-usage.ts 4
```

## Types Cheat Sheet

```typescript
interface PageStatus {
  status: { indicator: string; description: string }
}

interface Component {
  id: string;
  name: string;
  status: 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage';
}

interface Incident {
  id: string;
  name: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  impact: 'none' | 'minor' | 'major' | 'critical';
  components: Component[];
  incident_updates: IncidentUpdate[];
  shortlink: string;
}

interface IncidentUpdate {
  status: string;
  body: string;
  created_at: string;
}

interface GatewayOutageStatus {
  isOutage: boolean;
  gatewayComponent: Component | null;
  activeIncidents: Incident[];
  overallPageStatus: string;
}
```

## Environment Variables

```bash
# For GitHub integration (optional)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxx
```

## Need Help?

- **API Reference**: See `tools/vercel-status/README.md`
- **Full Guide**: See `tools/vercel-status/IMPLEMENTATION_GUIDE.md`
- **Examples**: See `tools/vercel-status/example-usage.ts`
- **AGENTS.md**: See updated "Vercel Status Monitoring" section

## One-Liner Examples

```typescript
// Is Gateway down?
(await checkGatewayOutageStatus()).isOutage

// Get first incident
(await getActiveGatewayIncidents())[0]

// Get latest update
getLatestIncidentUpdate((await getActiveGatewayIncidents())[0])?.body

// Check overall status
(await getPageStatus()).status.indicator
```

## OutageManager (Recommended for Full Automation)

```typescript
const manager = new OutageManager({
  owner: 'vercel',
  repo: 'ai',
  githubToken: process.env.GITHUB_TOKEN!,
  onError: (error) => console.error(error),
});

// Automatically: create → pin → update → close
await manager.handleIncident(incident);
```

This handles:
- ✅ Creating issue on first detection
- ✅ Pinning to repository
- ✅ Updating with new information
- ✅ Detecting when resolved
- ✅ Unpinning and closing issue

---

**For more details**, see the other documentation files in `tools/vercel-status/`.
