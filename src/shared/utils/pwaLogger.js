import { logPwaEvent } from './pwaTelemetry.js';

// Legacy function for backward compatibility
export async function logPwaInstallEvent(eventType, details = {}) {
  await logPwaEvent(eventType, details);
}


