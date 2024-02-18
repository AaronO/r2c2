export type LocationHint = 'apac' | 'eeur' | 'enam' | 'weur' | 'wnam';
export type ColoHints = Record<string, LocationHint>;

// Derived from https://github.com/Netrvin/cloudflare-colo-list/blob/main/DC-Colos.json
import * as locations from './locations.json';
const LOCATIONS = locations as ColoHints;

export function reqLocation(req: Request): LocationHint | undefined {
  return LOCATIONS[req.cf?.colo as string];
}
