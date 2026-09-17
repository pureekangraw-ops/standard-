function words(value) {
  const source = String(value || "").toLocaleLowerCase();
  const terms = new Set();
  try {
    const segmenter = new Intl.Segmenter(["th", "en"], { granularity: "word" });
    for (const item of segmenter.segment(source)) {
      const word = item.segment.trim();
      if (item.isWordLike && word.length > 1) terms.add(word);
    }
  } catch {
    for (const word of source.split(/[^\p{L}\p{N}]+/u)) {
      if (word.length > 1) terms.add(word);
    }
  }
  return [...terms];
}

function relevance(core, helper, terms) {
  return terms.reduce((score, term) => ({
    core: score.core + (core.includes(term) ? 1 : 0),
    helper: score.helper + (helper.includes(term) ? 1 : 0),
  }), { core: 0, helper: 0 });
}

function score(candidate) {
  return candidate.relevance.core * 2 + candidate.relevance.helper;
}

export function createMimirStructuredRetriever({ coreText, helperText = () => "" } = {}) {
  if (typeof coreText !== "function") throw new TypeError("MIMIR retriever coreText is required");
  if (typeof helperText !== "function") throw new TypeError("MIMIR retriever helperText must be a function");

  return function retrieve({ records = [], query = "" } = {}) {
    if (!Array.isArray(records)) throw new TypeError("MIMIR retriever records must be an array");
    const terms = words(query);
    return records
      .map((record, index) => {
        const core = String(coreText(record) || "").toLocaleLowerCase();
        const helper = String(helperText(record) || "").toLocaleLowerCase();
        const match = relevance(core, helper, terms);
        return Object.freeze({ record, relevance: Object.freeze(match), score: score({ relevance: match }), index });
      })
      .filter(candidate => candidate.relevance.core > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
  };
}
