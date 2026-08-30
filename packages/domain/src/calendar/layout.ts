import { type Interval, overlaps } from '../time/interval';

/**
 * Column layout for day and week views.
 *
 * Events that overlap in time are placed side by side. This is pure geometry:
 * it takes intervals and returns fractional x-offsets and widths, so the view
 * layer only has to multiply by its own pixel dimensions.
 */

export interface LaidOutItem<T> {
  item: T;
  interval: Interval;
  /** 0..1 from the left edge of the day column. */
  left: number;
  /** 0..1 of the day column's width. */
  width: number;
  column: number;
  columnCount: number;
}

/** Minimum visual height, expressed in minutes, so 5-minute events stay tappable. */
export const MIN_VISUAL_MINUTES = 20;

export function layoutOverlappingEvents<T>(
  items: readonly T[],
  getInterval: (item: T) => Interval,
): LaidOutItem<T>[] {
  const entries = items
    .map((item) => ({ item, interval: getInterval(item) }))
    .sort((a, b) => a.interval.start - b.interval.start || b.interval.end - a.interval.end);

  const result: LaidOutItem<T>[] = [];

  // A cluster is a maximal run of events connected by overlap. Column counts
  // are shared within a cluster so widths stay consistent across it.
  let cluster: typeof entries = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    result.push(...assignColumns(cluster));
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const entry of entries) {
    if (cluster.length > 0 && entry.interval.start >= clusterEnd) flush();
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.interval.end);
  }
  flush();

  return result;
}

function assignColumns<T>(cluster: { item: T; interval: Interval }[]): LaidOutItem<T>[] {
  const columns: { item: T; interval: Interval }[][] = [];

  for (const entry of cluster) {
    const target = columns.find(
      (column) => !column.some((placed) => overlaps(placed.interval, entry.interval)),
    );
    if (target) target.push(entry);
    else columns.push([entry]);
  }

  const columnCount = columns.length;
  const laidOut: LaidOutItem<T>[] = [];

  columns.forEach((column, columnIndex) => {
    for (const entry of column) {
      laidOut.push({
        item: entry.item,
        interval: entry.interval,
        column: columnIndex,
        columnCount,
        left: columnIndex / columnCount,
        width: 1 / columnCount,
      });
    }
  });

  return laidOut;
}

/**
 * Vertical placement inside a day column, as fractions of the visible band.
 * `dayStart`/`dayEnd` let a view crop to working hours instead of a full 24h.
 */
export function verticalPlacement(
  interval: Interval,
  dayStart: number,
  dayEnd: number,
): { top: number; height: number } {
  const span = Math.max(dayEnd - dayStart, 1);
  const clampedStart = Math.min(Math.max(interval.start, dayStart), dayEnd);
  const clampedEnd = Math.min(Math.max(interval.end, dayStart), dayEnd);

  return {
    top: (clampedStart - dayStart) / span,
    height: Math.max((clampedEnd - clampedStart) / span, 0),
  };
}
