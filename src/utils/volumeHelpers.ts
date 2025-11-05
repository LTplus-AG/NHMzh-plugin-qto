/**
 * Helper functions for handling volume values that can be either:
 * - a simple number
 * - an object with net/gross properties
 * - null or undefined
 */

export function getVolumeValue(volume: number | { net?: number; gross?: number } | null | undefined): number | null {
  if (volume === null || volume === undefined) return null;
  if (typeof volume === 'number') return volume;
  // For object type, prefer net, fallback to gross, or null if both are undefined
  return volume.net ?? volume.gross ?? null;
}

