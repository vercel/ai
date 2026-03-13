/**
 * GitHub Integration for Vercel Status Incidents
 * 
 * Handles automatic issue creation, pinning, updating, and closing
 * when Gateway outages are detected on the Vercel Status Page.
 */

import { Incident, IncidentUpdate, Component, formatIncidentForDisplay } from './status-checker';

// ============================================================================
// Types
// ============================================================================

export interface GitHubIssueOptions {
  owner: string;
  repo: string;
  githubToken: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  pinned?: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// GitHub API Helpers
// ============================================================================

/**
 * Make an authenticated request to GitHub API
 */
async function githubRequest(
  method: string,
  endpoint: string,
  token: string,
  data?: unknown
): Promise<Response> {
  const url = `https://api.github.com${endpoint}`;
  
  const headers: HeadersInit = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  
  const options: RequestInit = {
    method,
    headers,
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GitHub API error (${response.status}): ${response.statusText}\n${errorBody}`
    );
  }
  
  return response;
}

/**
 * Parse JSON response from GitHub API
 */
async function parseGithubResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  return JSON.parse(text) as T;
}

// ============================================================================
// Issue Management Functions
// ============================================================================

/**
 * Create a service alert issue for a Gateway outage
 */
export async function createOutageIssue(
  incident: Incident,
  options: GitHubIssueOptions
): Promise<GitHubIssue> {
  const { owner, repo, githubToken } = options;
  
  const title = `[Service Alert] Vercel Gateway Outage: ${incident.name}`;
  const body = buildIssueBody(incident);
  
  const response = await githubRequest(
    'POST',
    `/repos/${owner}/${repo}/issues`,
    githubToken,
    {
      title,
      body,
      labels: ['infrastructure', 'gateway', 'outage'],
    }
  );
  
  return parseGithubResponse<GitHubIssue>(response);
}

/**
 * Update an existing outage issue with new incident information
 */
export async function updateOutageIssue(
  issueNumber: number,
  incident: Incident,
  options: GitHubIssueOptions
): Promise<GitHubIssue> {
  const { owner, repo, githubToken } = options;
  
  const body = buildIssueBody(incident);
  
  const response = await githubRequest(
    'PATCH',
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    githubToken,
    { body }
  );
  
  return parseGithubResponse<GitHubIssue>(response);
}

/**
 * Close an outage issue
 */
export async function closeOutageIssue(
  issueNumber: number,
  options: GitHubIssueOptions
): Promise<GitHubIssue> {
  const { owner, repo, githubToken } = options;
  
  const response = await githubRequest(
    'PATCH',
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    githubToken,
    { state: 'closed' }
  );
  
  return parseGithubResponse<GitHubIssue>(response);
}

/**
 * Pin an issue to the repository
 * 
 * Note: Requires the issue to have write permissions.
 * Uses the GitHub REST API to set the pinned state.
 */
export async function pinIssue(
  issueNumber: number,
  options: GitHubIssueOptions
): Promise<void> {
  const { owner, repo, githubToken } = options;
  
  // GitHub's pin API is through a custom media type
  // POST /repos/:owner/:repo/issues/:issue_number/pin
  await githubRequest(
    'POST',
    `/repos/${owner}/${repo}/issues/${issueNumber}/pin`,
    githubToken
  );
}

/**
 * Unpin an issue from the repository
 */
export async function unpinIssue(
  issueNumber: number,
  options: GitHubIssueOptions
): Promise<void> {
  const { owner, repo, githubToken } = options;
  
  // DELETE /repos/:owner/:repo/issues/:issue_number/pin
  await githubRequest(
    'DELETE',
    `/repos/${owner}/${repo}/issues/${issueNumber}/pin`,
    githubToken
  );
}

/**
 * Search for existing outage issue related to a Gateway incident
 * Returns the issue number if found, null otherwise
 */
export async function findExistingOutageIssue(
  options: GitHubIssueOptions
): Promise<number | null> {
  const { owner, repo, githubToken } = options;
  
  // Search for open issues with 'Gateway' and 'outage' labels
  const response = await githubRequest(
    'GET',
    `/repos/${owner}/${repo}/issues?state=open&labels=gateway,outage`,
    githubToken
  );
  
  const issues = await parseGithubResponse<GitHubIssue[]>(response);
  
  if (issues.length > 0) {
    // Return the first (most recent) open outage issue
    return issues[0].number;
  }
  
  return null;
}

// ============================================================================
// Issue Body Builder
// ============================================================================

/**
 * Build the markdown body for an outage issue
 */
function buildIssueBody(incident: Incident): string {
  const latest = incident.incident_updates?.[incident.incident_updates.length - 1];
  const startedAt = new Date(incident.started_at).toISOString();
  
  let body = `## Incident Details\n\n`;
  
  body += `**Status**: ${capitalizeFirstLetter(incident.status)}\n`;
  body += `**Impact Level**: ${capitalizeFirstLetter(incident.impact)}\n`;
  body += `**Started At**: ${startedAt}\n`;
  
  if (incident.resolved_at) {
    const resolvedAt = new Date(incident.resolved_at).toISOString();
    body += `**Resolved At**: ${resolvedAt}\n`;
  }
  
  body += `\n### Affected Components\n\n`;
  
  if (incident.components.length > 0) {
    body += incident.components
      .map(c => `- **${c.name}** (${c.status})`)
      .join('\n');
  } else {
    body += 'No specific components listed';
  }
  
  body += `\n\n### Latest Update\n\n`;
  
  if (latest) {
    body += `**Status**: ${capitalizeFirstLetter(latest.status)}\n`;
    body += `**Time**: ${new Date(latest.created_at).toISOString()}\n\n`;
    body += latest.body;
  } else {
    body += 'No updates available yet.';
  }
  
  body += `\n\n### Links\n\n`;
  body += `- [View on Status Page](${incident.shortlink})\n`;
  body += `- [Status Page](https://www.vercel-status.com/)\n`;
  
  body += `\n---\n`;
  body += `_This issue is automatically managed by the AI SDK repository based on Vercel's status page._`;
  
  return body;
}

/**
 * Capitalize first letter of a string
 */
function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// Outage Management Orchestrator
// ============================================================================

export interface OutageManagerOptions extends GitHubIssueOptions {
  checkIntervalMs?: number;
  onError?: (error: Error) => void;
}

/**
 * High-level orchestrator for managing Gateway outages
 * 
 * This handles the complete lifecycle:
 * 1. Detect outages
 * 2. Create/update GitHub issues
 * 3. Pin issues
 * 4. Monitor for resolution
 * 5. Close and unpin when resolved
 */
export class OutageManager {
  private options: OutageManagerOptions;
  private currentIssueNumber: number | null = null;
  private lastIncidentId: string | null = null;
  private isPinned = false;

  constructor(options: OutageManagerOptions) {
    this.options = options;
  }

  /**
   * Process an incident and manage GitHub issue
   */
  async handleIncident(incident: Incident): Promise<void> {
    try {
      // If this is a new incident
      if (incident.id !== this.lastIncidentId) {
        this.lastIncidentId = incident.id;
        
        // Check if issue already exists
        if (!this.currentIssueNumber) {
          this.currentIssueNumber = await findExistingOutageIssue(this.options);
        }
        
        // Create or update issue
        if (this.currentIssueNumber) {
          await updateOutageIssue(this.currentIssueNumber, incident, this.options);
        } else {
          const issue = await createOutageIssue(incident, this.options);
          this.currentIssueNumber = issue.number;
        }
        
        // Pin the issue if not already pinned
        if (!this.isPinned && this.currentIssueNumber) {
          await pinIssue(this.currentIssueNumber, this.options);
          this.isPinned = true;
        }
      }
      // If the incident is still ongoing, update the issue
      else if (this.currentIssueNumber && incident.status !== 'resolved') {
        await updateOutageIssue(this.currentIssueNumber, incident, this.options);
      }
      // If the incident is now resolved
      else if (this.currentIssueNumber && incident.status === 'resolved') {
        await updateOutageIssue(this.currentIssueNumber, incident, this.options);
        await unpinIssue(this.currentIssueNumber, this.options);
        await closeOutageIssue(this.currentIssueNumber, this.options);
        
        // Reset state
        this.currentIssueNumber = null;
        this.lastIncidentId = null;
        this.isPinned = false;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.options.onError) {
        this.options.onError(err);
      } else {
        throw err;
      }
    }
  }

  /**
   * Get the current issue number, if any
   */
  getCurrentIssueNumber(): number | null {
    return this.currentIssueNumber;
  }
}
