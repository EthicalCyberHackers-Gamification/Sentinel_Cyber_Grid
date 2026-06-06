/**
 * Context-aware UI label helpers.
 *
 * Extracted from script.js so the labelling logic can be unit-tested under
 * node without a DOM (script.js runs DOM init on import and cannot be loaded
 * outside the browser). The exact strings here mirror what the mission "back"
 * buttons render: when the player reached a mission from the Operations Center
 * map we send them back to the OC; otherwise we use the module-overview wording.
 *
 * Two presentations exist for historical reasons and are preserved verbatim:
 *   - `default` — Mission 1's dashboard back button (plain spacing).
 *   - `compact` — Mission 2/3 overview back buttons (non-breaking space, and
 *     the longer "Back to Module Overview" wording).
 */

export const MISSION_BACK_LABELS = {
  default: {
    operationsCenter: "\u2190 Operations Center",
    moduleOverview: "\u2190 Module Overview",
  },
  compact: {
    operationsCenter: "\u2190\u00a0 Operations Center",
    moduleOverview: "\u2190\u00a0 Back to Module Overview",
  },
};

/**
 * Pick the back-button label for a mission screen.
 *
 * @param {boolean} launchedFromOC  true when the player arrived via the
 *   Operations Center map (label points back to the OC).
 * @param {{ compact?: boolean }} [opts]  use the compact (Mission 2/3) wording.
 * @returns {string} the label to render.
 */
export function missionBackLabel(launchedFromOC, { compact = false } = {}) {
  const set = compact ? MISSION_BACK_LABELS.compact : MISSION_BACK_LABELS.default;
  return launchedFromOC ? set.operationsCenter : set.moduleOverview;
}
