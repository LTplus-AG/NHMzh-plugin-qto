/**
 * Helper functions for handling volume values that can be either:
 * - a simple number
 * - an object with net/gross properties
 * - null or undefined
 */

export function getVolumeValue(volume: number | { net?: number; gross?: number } | null | undefined): number {
  if (volume === null || volume === undefined) return 0;
  if (typeof volume === 'number') return volume;
  // For object type, prefer net, fallback to gross
  return volume.net ?? volume.gross ?? 0;
}

