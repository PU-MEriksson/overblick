import {Element, PointUtils} from 'sn-plugin-lib';
import type {Point} from 'sn-plugin-lib';

type Size = {width: number; height: number};

/**
 * How far down the page anything is written or placed, in whole screen px, or
 * null for an empty page. Reads every stroke's points, one stroke at a time:
 * slow on a full page, quick on one with just a heading. Titles and links are
 * made of strokes, so the strokes cover them.
 */
export async function lowestContent(
  elements: Element[],
  pageSize: Size,
): Promise<number | null> {
  let lowest = -Infinity;
  const lowestOf = (points: Point[]) => {
    for (const point of points) {
      lowest = Math.max(lowest, point.y);
    }
  };

  for (const el of elements) {
    if (el.type === Element.TYPE_STROKE && el.stroke) {
      const count = await el.stroke.points.size();
      if (count > 0) {
        // Stroke points are EMR, the pen's own units (see docs/api-notes.md).
        const points = await el.stroke.points.getRange(0, count);
        lowestOf(points.map(p => PointUtils.emrPoint2Android(p, pageSize)));
      }
    } else if (el.type === Element.TYPE_TEXT && el.textBox) {
      lowest = Math.max(lowest, el.textBox.textRect.bottom);
    } else if (el.type === Element.TYPE_GEO && el.geometry) {
      // Geometry points are already screen px.
      lowestOf(el.geometry.points ?? []);
      const center = el.geometry.ellipseCenterPoint;
      if (center) {
        const radius = Math.max(
          el.geometry.ellipseMajorAxisRadius,
          el.geometry.ellipseMinorAxisRadius,
        );
        lowest = Math.max(lowest, center.y + radius);
      }
    } else if (el.type === Element.TYPE_PICTURE && el.picture) {
      lowest = Math.max(lowest, el.picture.rect.bottom);
    } else if (el.type === Element.TYPE_FIVE_STAR && el.fiveStar) {
      lowestOf(el.fiveStar.points ?? []);
    }
  }
  // Rounded up: converted stroke points have decimals, and a rect built from
  // them must be whole numbers.
  return Number.isFinite(lowest) ? Math.ceil(lowest) : null;
}
