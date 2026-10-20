export const REGION_ORDER = ["tabs", "scene", "reader", "status"] as const;
export type RegionId = (typeof REGION_ORDER)[number];

export function cycleRegion(current: RegionId, delta: 1 | -1, readerOpen: boolean): RegionId {
  const order = REGION_ORDER.filter((region) => region !== "reader" || readerOpen);
  const index = Math.max(0, order.indexOf(current));
  return order[(index + delta + order.length) % order.length];
}
