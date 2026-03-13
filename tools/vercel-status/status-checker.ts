/**
 * Vercel Status Page API Integration
 * 
 * This utility provides helpers for monitoring Vercel infrastructure status
 * and detecting issues like Gateway outages.
 * 
 * API Reference: https://www.vercel-status.com/api/v2/
 */

import fetch from 'node-fetch';

const VERCEL_STATUS_API_BASE = 'https://www.vercel-status.com/api/v2';

// ============================================================================
// Types
// ============================================================================

export interface StatusPageInfo {
  id: string;
  name: string;
  url: string;
  time_zone: string;
  updated_at: string;
}

export interface PageStatus {
  page: StatusPageInfo;
  status: {
    indicator: 'none' | 'minor' | 'major' | 'critical';
    description: string;
  };
}

export interface Component {
  id: string;
  name: string;
  status: 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage';
  created_at: string;
  updated_at: string;
  position: number;
  description: string | null;
  showcase: boolean;
  start_date: string | null;
  group_id: string | null;
  page_id: string;
  group: boolean;
  only_show_if_degraded: boolean;
  components?: string[]; // For group components
}

export interface ComponentStatus {
  page: StatusPageInfo;
  components: Component[];
}

export interface AffectedComponent {
  code: string;
  name: string;
  old_status: string;
  new_status: string;
}

export interface IncidentUpdate {
  id: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  body: string;
  incident_id: string;
  created_at: string;
  updated_at: string;
  display_at: string;
  affected_components: AffectedComponent[] | null;
  deliver_notifications: boolean;
  custom_tweet: string | null;
  tweet_id: string | null;
}

export interface Incident {
  id: string;
  name: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  created_at: string;
  updated_at: string;
  monitoring_at: string | null;
  resolved_at: string | null;
  impact: 'none' | 'minor' | 'major' | 'critical';
  shortlink: string;
  started_at: string;
  page_id: string;
  incident_updates: IncidentUpdate[];
  components: Component[];
  reminder_intervals: null;
}

export interface IncidentsResponse {
  page: StatusPageInfo;
  incidents: Incident[];
}

// ============================================================================
// API Fetching Functions
// ============================================================================

/**
 * Fetch overall page status from Vercel Status Page
 */
export async function getPageStatus(): Promise<PageStatus> {
  const response = await fetch(`${VERCEL_STATUS_API_BASE}/status.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch page status: ${response.statusText}`);
  }
  return (await response.json()) as PageStatus;
}

/**
 * Fetch all components with their current status
 */
export async function getComponents(): Promise<ComponentStatus> {
  const response = await fetch(`${VERCEL_STATUS_API_BASE}/components.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch components: ${response.statusText}`);
  }
  return (await response.json()) as ComponentStatus;
}

/**
 * Fetch all incidents (active and historical)
 */
export async function getIncidents(): Promise<IncidentsResponse> {
  const response = await fetch(`${VERCEL_STATUS_API_BASE}/incidents.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch incidents: ${response.statusText}`);
  }
  return (await response.json()) as IncidentsResponse;
}

// ============================================================================
// Gateway Status Functions
// ============================================================================

/**
 * Find the Gateway component by name
 * Returns null if Gateway component not found
 */
export async function findGatewayComponent(): Promise<Component | null> {
  const { components } = await getComponents();
  
  // Look for "AI Gateway" or "Gateway" in the name
  const gateway = components.find(
    c => c.name.toLowerCase().includes('gateway') && 
         (c.name.toLowerCase().includes('ai') || c.name === 'Gateway')
  );
  
  return gateway || null;
}

/**
 * Check if Gateway is experiencing any issues
 */
export async function isGatewayOperational(): Promise<boolean> {
  const gateway = await findGatewayComponent();
  if (!gateway) {
    console.warn('Gateway component not found in status page');
    return true; // Assume operational if not found
  }
  
  return gateway.status === 'operational';
}

/**
 * Get active Gateway-related incidents
 */
export async function getActiveGatewayIncidents(): Promise<Incident[]> {
  const gateway = await findGatewayComponent();
  if (!gateway) {
    return [];
  }
  
  const { incidents } = await getIncidents();
  
  return incidents.filter(
    incident =>
      incident.status !== 'resolved' &&
      incident.components.some(c => c.id === gateway.id)
  );
}

/**
 * Get the latest update for a Gateway incident
 */
export function getLatestIncidentUpdate(incident: Incident): IncidentUpdate | null {
  if (!incident.incident_updates || incident.incident_updates.length === 0) {
    return null;
  }
  
  // Updates are in chronological order, so the last one is the latest
  return incident.incident_updates[incident.incident_updates.length - 1];
}

/**
 * Format an incident for display (e.g., in a GitHub issue)
 */
export function formatIncidentForDisplay(incident: Incident): string {
  const latest = getLatestIncidentUpdate(incident);
  const startedAt = new Date(incident.started_at).toISOString();
  
  let output = `## ${incident.name}\n\n`;
  output += `**Status**: ${incident.status.charAt(0).toUpperCase() + incident.status.slice(1)}\n`;
  output += `**Impact**: ${incident.impact}\n`;
  output += `**Started**: ${startedAt}\n`;
  
  if (incident.resolved_at) {
    const resolvedAt = new Date(incident.resolved_at).toISOString();
    output += `**Resolved**: ${resolvedAt}\n`;
  }
  
  output += `**Affected Components**: ${incident.components.map(c => `\`${c.name}\``).join(', ')}\n\n`;
  
  if (latest) {
    output += `**Latest Update** (${latest.status}):\n\n`;
    output += latest.body;
  }
  
  output += `\n\n[View on Status Page](${incident.shortlink})`;
  
  return output;
}

// ============================================================================
// Outage Detection Helper
// ============================================================================

export interface GatewayOutageStatus {
  isOutage: boolean;
  gatewayComponent: Component | null;
  activeIncidents: Incident[];
  overallPageStatus: 'none' | 'minor' | 'major' | 'critical';
}

/**
 * Comprehensive check for Gateway outage status
 */
export async function checkGatewayOutageStatus(): Promise<GatewayOutageStatus> {
  try {
    const [pageStatus, gateway, incidents] = await Promise.all([
      getPageStatus(),
      findGatewayComponent(),
      getActiveGatewayIncidents(),
    ]);
    
    const isOutage =
      gateway !== null &&
      gateway.status !== 'operational' &&
      incidents.length > 0;
    
    return {
      isOutage,
      gatewayComponent: gateway,
      activeIncidents: incidents,
      overallPageStatus: pageStatus.status.indicator,
    };
  } catch (error) {
    console.error('Error checking Gateway outage status:', error);
    throw error;
  }
}

// ============================================================================
// Status Page Monitoring
// ============================================================================

/**
 * Poll the status page at regular intervals
 * Returns an unsubscribe function
 */
export function monitorGatewayStatus(
  onStatusChange: (status: GatewayOutageStatus) => void | Promise<void>,
  intervalMs: number = 60000 // Default 1 minute
): () => void {
  let lastStatus: GatewayOutageStatus | null = null;
  
  const checkAndNotify = async () => {
    try {
      const currentStatus = await checkGatewayOutageStatus();
      
      // Only notify if status changed
      if (
        !lastStatus ||
        lastStatus.isOutage !== currentStatus.isOutage ||
        lastStatus.activeIncidents.length !== currentStatus.activeIncidents.length
      ) {
        await onStatusChange(currentStatus);
        lastStatus = currentStatus;
      }
    } catch (error) {
      console.error('Error in monitor loop:', error);
    }
  };
  
  // Initial check
  checkAndNotify();
  
  // Set up interval
  const interval = setInterval(checkAndNotify, intervalMs);
  
  // Return unsubscribe function
  return () => clearInterval(interval);
}
