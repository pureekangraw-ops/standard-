"use strict";

export const COMPARISON_STATUSES = Object.freeze([
  "MATCH",
  "DIFFERENT",
  "CONFLICT",
  "STALE?",
  "UNKNOWN",
  "NOT COMPARABLE",
]);

const STATUS_SET = new Set(COMPARISON_STATUSES);
const NON_LIVE = new Set(["UNKNOWN", "STALE", "STALE?", "CONFLICT"]);

function text(value) {
  return String(value ?? "").trim();
}

function required(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function iso(clock) {
  return new Date((typeof clock === "function" ? clock() : Date.now())).toISOString();
}

function references(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Mission Card references must be an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Mission Card reference ${index} must be an object`);
    }
    return freeze({
      label: text(item.label) || null,
      ref: text(item.ref || item.url) || null,
    });
  });
}

export function createMissionCard(input = {}, { now = () => Date.now() } = {}) {
  const card = {
    kind: "MISSION_CARD_POINTER",
    version: 1,
    workId: required(input.workId, "Mission Card Work ID"),
    checkpointId: required(input.checkpointId, "Mission Card Checkpoint ID"),
    jobCode: text(input.jobCode) || null,
    references: references(input.references),
    issuedAt: iso(now),
  };
  // Deliberately do not copy status, owner, phase, result, or any other truth.
  return freeze(card);
}

export function assertMissionCard(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) {
    throw new Error("MISSION_CARD_INVALID");
  }
  required(card.workId, "Mission Card Work ID");
  required(card.checkpointId, "Mission Card Checkpoint ID");
  if (card.kind !== "MISSION_CARD_POINTER") throw new Error("MISSION_CARD_KIND_INVALID");
  return card;
}

export async function resolveMissionCard(card, { readWork } = {}) {
  assertMissionCard(card);
  if (typeof readWork !== "function") throw new Error("MISSION_CARD_OWNER_SOURCE_READER_REQUIRED");
  const work = await readWork({
    workId: card.workId,
    checkpointId: card.checkpointId,
    fresh: true,
  });
  return freeze({
    card: clone(card),
    work: clone(work),
    readMode: "FRESH_OWNER_SOURCE",
    resolvedAt: new Date().toISOString(),
  });
}

function normalizeObservation(source, value, observedAt) {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value : { data: value };
  const status = text(item.status).toUpperCase() || (value == null ? "UNKNOWN" : "LIVE");
  return freeze({
    source,
    ownerSource: text(item.ownerSource || item.owner || source),
    status,
    data: clone(item.data === undefined ? value : item.data),
    sourceRef: text(item.sourceRef || item.evidenceRef || item.ref) || null,
    observedAt: text(item.observedAt) || observedAt,
  });
}

export function createCardCounter({ resolveWork, projections = [], now = () => Date.now() } = {}) {
  if (typeof resolveWork !== "function") throw new TypeError("Card Counter resolveWork is required");
  const readers = projections.map((projection, index) => {
    if (!projection || typeof projection !== "object") throw new TypeError(`Projection ${index} is invalid`);
    return Object.freeze({
      source: required(projection.source, `Projection ${index} source`),
      read: typeof projection.read === "function" ? projection.read : async () => null,
    });
  });

  return Object.freeze({
    async tap(card, { lens = "default" } = {}) {
      const pointer = assertMissionCard(card);
      const observedAt = iso(now);
      let resolved;
      try {
        resolved = await resolveMissionCard(pointer, { readWork: resolveWork });
      } catch (error) {
        return freeze({
          kind: "CARD_COUNTER_PROJECTION",
          mode: "READ_ONLY",
          mutates: false,
          lens: text(lens) || "default",
          card: clone(pointer),
          workId: pointer.workId,
          checkpointId: pointer.checkpointId,
          work: null,
          observations: [],
          error: error instanceof Error ? error.message : String(error),
          observedAt,
        });
      }

      const observations = await Promise.all(readers.map(async ({ source, read }) => {
        try {
          const value = await read({
            card: pointer,
            resolved,
            work: resolved.work,
            lens: text(lens) || "default",
            fresh: true,
          });
          return normalizeObservation(source, value, observedAt);
        } catch (error) {
          return normalizeObservation(source, {
            status: "UNKNOWN",
            ownerSource: source,
            data: null,
            sourceRef: null,
            error: error instanceof Error ? error.message : String(error),
          }, observedAt);
        }
      }));

      return freeze({
        kind: "CARD_COUNTER_PROJECTION",
        mode: "READ_ONLY",
        mutates: false,
        lens: text(lens) || "default",
        card: clone(pointer),
        workId: pointer.workId,
        checkpointId: pointer.checkpointId,
        work: clone(resolved.work),
        observations,
        observedAt,
      });
    },
  });
}

function observationMap(observations = []) {
  return new Map((Array.isArray(observations) ? observations : []).map(item => [item.source, item]));
}

export function compareOneToOne({ topic, left, right } = {}) {
  const label = text(topic);
  if (!label || !left || !right) {
    return freeze({ status: "NOT COMPARABLE", topic: label || null, reason: "MISSING_PAIR" });
  }
  const leftStatus = text(left.status).toUpperCase();
  const rightStatus = text(right.status).toUpperCase();
  if (leftStatus === "CONFLICT" || rightStatus === "CONFLICT") {
    return freeze({ status: "CONFLICT", topic: label, left, right, reason: "SOURCE_DECLARED_CONFLICT" });
  }
  if (leftStatus === "STALE" || leftStatus === "STALE?" || rightStatus === "STALE" || rightStatus === "STALE?") {
    return freeze({ status: "STALE?", topic: label, left, right, reason: "SOURCE_FRESHNESS_REQUIRES_CHECK" });
  }
  if (leftStatus === "UNKNOWN" || rightStatus === "UNKNOWN") {
    return freeze({ status: "UNKNOWN", topic: label, left, right, reason: "SOURCE_UNKNOWN" });
  }
  if (left.data === undefined || right.data === undefined) {
    return freeze({ status: "NOT COMPARABLE", topic: label, left, right, reason: "VALUE_UNAVAILABLE" });
  }
  const same = JSON.stringify(left.data) === JSON.stringify(right.data);
  return freeze({
    status: same ? "MATCH" : "DIFFERENT",
    topic: label,
    left,
    right,
    reason: same ? "OBSERVATIONS_MATCH" : "OBSERVATIONS_DIFFER",
  });
}

export function createDoubtEngine(comparisons = []) {
  return (Array.isArray(comparisons) ? comparisons : [])
    .filter(item => item && item.status && item.status !== "MATCH")
    .map(item => freeze({
      label: "WORTH CHECKING",
      topic: item.topic || null,
      status: STATUS_SET.has(item.status) ? item.status : "UNKNOWN",
      question: item.question || `ตรวจ ${item.topic || "observation"} จาก owner source อีกครั้ง`,
    }));
}

export function compareBriefs(previousBrief, currentBrief) {
  if (!previousBrief || !currentBrief) return [];
  const before = observationMap(previousBrief.observations);
  const after = observationMap(currentBrief.observations);
  const sources = new Set([...before.keys(), ...after.keys()]);
  return [...sources].map(source => {
    const previous = before.get(source) || null;
    const current = after.get(source) || null;
    const changed = JSON.stringify(previous) !== JSON.stringify(current);
    return freeze({
      label: "SINCE LAST BRIEF",
      source,
      changed,
      before: previous,
      after: current,
      status: changed ? "CHANGED" : "UNCHANGED",
    });
  }).filter(item => item.changed);
}

export function composeDressingBrief({ counterProjection, lightIntel = null, comparisons = [], previousBrief = null, now = () => Date.now() } = {}) {
  if (!counterProjection || counterProjection.kind !== "CARD_COUNTER_PROJECTION") {
    throw new Error("DRESSING_BRIEF_COUNTER_PROJECTION_REQUIRED");
  }
  const requiredSources = ["CENTRE", "HEIMDALL", "BOARD", "FACTORY", "GITHUB", "CLOUDFLARE", "CONTROL ROOM"];
  const sourceMap = observationMap(counterProjection.observations);
  const observations = requiredSources.map(source => sourceMap.get(source) || normalizeObservation(source, { status: "UNKNOWN", data: null }, iso(now)));
  if (lightIntel) observations.push(normalizeObservation("LIGHT", lightIntel, iso(now)));
  const brief = {
    kind: "DRESSING_ROOM_REALITY_BRIEF",
    mode: "READ_ONLY_BRIEFING",
    mutates: false,
    workId: counterProjection.workId,
    checkpointId: counterProjection.checkpointId,
    lens: counterProjection.lens,
    observations,
    sourceReferences: observations.map(item => ({ source: item.source, ownerSource: item.ownerSource, ref: item.sourceRef })),
    comparisons: clone(comparisons),
    doubts: createDoubtEngine(comparisons),
    light: lightIntel ? { status: text(lightIntel.status).toUpperCase() || "LIVE", optional: true } : { status: "UNAVAILABLE", optional: true },
    observedAt: iso(now),
  };
  brief.sinceLastBrief = compareBriefs(previousBrief, brief);
  return freeze(brief);
}

export async function rebrief(card, { counter, lightIntel, comparisons = [], previousBrief = null, lens = "default" } = {}) {
  if (!counter || typeof counter.tap !== "function") throw new Error("REBRIEF_COUNTER_REQUIRED");
  const projection = await counter.tap(card, { lens });
  const intel = typeof lightIntel === "function" ? await lightIntel({ card, projection, fresh: true }) : lightIntel;
  return composeDressingBrief({ counterProjection: projection, lightIntel: intel, comparisons, previousBrief });
}

export const __private = Object.freeze({ NON_LIVE });
