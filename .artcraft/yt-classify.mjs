/**
 * One classifier, two consumers.
 *
 * `yt-dashboard.mjs` draws the panel and `yt-clone-analysis.mjs` writes the report.
 * Both must agree on two questions:
 *
 *   1. what is this channel about?      -> niche (content type, a filter)
 *   2. was it produced by AI?           -> Dark verdict (avatar, synthesised voice,
 *                                          automated editing, automated publishing)
 *
 * Dark is NOT a niche. There are Dark channels about technology, food, news and horror
 * alike. The niche weight in taxonomy.json ships as 0 for exactly that reason.
 *
 * Every number and keyword lives in taxonomy.json, so changing the file changes both
 * tools at once. No weights in code.
 */

import fs from 'node:fs';

/** YouTube's own categories, mapped onto taxonomy niche ids. */
export const YT_CATEGORY_TO_NICHE = {
  Gaming: 'gaming',
  Music: 'musica',
  Education: 'educacao',
  'People & Blogs': 'vlogs',
  'Film & Animation': 'cinema-animacao',
  'News & Politics': 'noticias',
  Sports: 'desporto',
  Comedy: 'humor',
  'Science & Technology': 'tecnologia',
  'Autos & Vehicles': 'automoveis',
  Howto: 'educacao',
  'Howto & Style': 'educacao',
  'Travel & Events': 'vlogs',
};

const EMPTY_AI = {
  weights: {},
  threshold: 6,
  maxScore: 20,
  cadenceBands: [],
  avatarKeywords: [],
  automationKeywords: [],
  aiKeywords: [],
  humanKeywords: [],
  reactionKeywords: [],
};

/**
 * Build a classifier bound to one taxonomy file.
 *
 * @param {string} taxonomyPath absolute path to taxonomy.json
 * @returns {{TAXONOMY: object, AI: object, NICHE_BY_ID: Map, classifyChannel: Function,
 *            scoreAi: Function, applyOverride: Function, verdictOf: Function}}
 */
export function createClassifier(taxonomyPath) {
  const TAXONOMY = (() => {
    if (!fs.existsSync(taxonomyPath)) {
      console.error('taxonomia não encontrada: ' + taxonomyPath);
      return { niches: [{ id: 'outro', label: 'Outro', keywords: [] }], ai: EMPTY_AI, overrides: {} };
    }
    return JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));
  })();

  const AI = Object.assign({}, EMPTY_AI, TAXONOMY.ai || {});
  const NICHE_BY_ID = new Map((TAXONOMY.niches || []).map((n) => [n.id, n]));

  /** Plain substring matching — taxonomy keywords stay readable, no regex to escape. */
  function classifyChannel(channel, videos) {
    const scores = new Map();
    const bump = (id, n) => scores.set(id, (scores.get(id) || 0) + n);
    const nameText = String(channel || '').toLowerCase();

    for (const niche of TAXONOMY.niches || []) {
      for (const kw of niche.keywords || []) {
        if (nameText.includes(String(kw).toLowerCase())) bump(niche.id, 6);
      }
    }

    for (const v of (videos || []).slice(0, 12)) {
      const titleText = String(v.title || '').toLowerCase();
      const tagText = (v.tags || []).join(' ').toLowerCase();
      for (const niche of TAXONOMY.niches || []) {
        for (const kw of niche.keywords || []) {
          const k = String(kw).toLowerCase();
          if (titleText.includes(k)) bump(niche.id, 2);
          if (tagText.includes(k)) bump(niche.id, 2);
        }
      }
      for (const c of v.categories || []) {
        const id = YT_CATEGORY_TO_NICHE[c];
        if (id) bump(id, 1);
      }
    }

    const ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) {
      const fallback = NICHE_BY_ID.get('outro') || { id: 'outro', label: 'Outro' };
      return { niche: fallback.id, label: fallback.label, score: 0, confidence: 'low', runnerUp: null };
    }

    const best = NICHE_BY_ID.get(ranked[0][0]) || { id: ranked[0][0], label: ranked[0][0] };
    const runner = ranked[1] ? NICHE_BY_ID.get(ranked[1][0]) : null;
    return {
      niche: best.id,
      label: best.label,
      score: ranked[0][1],
      confidence: ranked[0][1] >= 12 ? 'high' : ranked[0][1] >= 6 ? 'medium' : 'low',
      runnerUp: runner ? runner.label : null,
    };
  }

  /**
   * Is this channel produced by AI?
   *
   * Positive signals: an avatar presenter or automation disclosed in the description, AI
   * tooling in the tags/titles, and a publishing cadence no human sustains (the overnight
   * bot -> script -> avatar -> edit -> publish loop leaves a fingerprint: many uploads).
   * Negative signals: a person on camera — vlogs, podcasts, reactions, "I recorded".
   *
   * Heuristic from public metadata only. A channel that never mentions AI anywhere cannot
   * be proven either way; taxonomy `overrides` settles those by hand.
   */
  function scoreAi(channel, videos, scan, nicheId) {
    const W = AI.weights || {};
    const reasons = [];
    let score = 0;
    const add = (pts, why) => {
      if (!pts) return;
      score += pts;
      reasons.push((pts > 0 ? '+' : '') + pts + ' ' + why);
    };
    const text = ((scan && scan.description) || '').toLowerCase();
    const tags = ((scan && scan.tags) || []).map((t) => String(t).toLowerCase()).join(' ');

    const hits = (haystack, list) => (list || []).filter((k) => haystack.includes(String(k).toLowerCase()));

    if (text) {
      const av = hits(text, AI.avatarKeywords);
      if (av.length) add(W.descriptionAvatar || 0, 'descrição fala de avatar (' + av.slice(0, 2).join(', ') + ')');

      const auto = hits(text, AI.automationKeywords);
      if (auto.length) add(W.descriptionAutomation || 0, 'descrição fala de automação (' + auto.slice(0, 2).join(', ') + ')');

      const aiHits = hits(text, AI.aiKeywords);
      if (aiHits.length) add(W.descriptionAi || 0, 'descrição assume IA (' + aiHits.slice(0, 2).join(', ') + ')');

      const human = hits(text, AI.humanKeywords);
      if (human.length) add(W.descriptionHuman || 0, 'descrição mostra humano (' + human.slice(0, 2).join(', ') + ')');
    }

    const tagAvatar = hits(tags, AI.avatarKeywords);
    if (tagAvatar.length) add(W.tagAvatar || 0, 'tags de avatar');
    const tagAi = hits(tags, AI.aiKeywords);
    if (tagAi.length) add(W.tagAi || 0, 'tags de IA');

    const titles = (videos || []).map((v) => String(v.title || '').toLowerCase()).join(' ');
    const titleAvatar = hits(titles, AI.avatarKeywords);
    if (titleAvatar.length) add(W.titleAvatar || 0, 'títulos mencionam avatar/IA');

    const humanVids = hits(titles, AI.humanKeywords);
    if (humanVids.length) add(W.humanKeyword || 0, 'títulos com formato humano (' + humanVids.slice(0, 2).join(', ') + ')');
    const reacts = hits(titles, AI.reactionKeywords);
    if (reacts.length) add(W.reactionFormat || 0, 'formato reacção');

    const nameLower = String(channel || '').toLowerCase();
    if (hits(nameLower, AI.humanKeywords).length) add(W.vlogName || 0, 'nome do canal é de vlog/humano');

    const cadence = channel && channel.rssVideosInWindow;
    if (typeof cadence === 'number') {
      for (const band of AI.cadenceBands || []) {
        if (cadence >= band.min) {
          add(band.points || 0, band.why || cadence + ' uploads/semana');
          break;
        }
      }
    }

    if (scan && scan.shorts >= 3) add(W.shortsActive || 0, 'publica shorts');

    // Niche weight is 0 by default on purpose: Dark is niche-agnostic. The hook stays so a
    // taxonomy edit can reintroduce it, but the topic never decides the verdict alone.
    const niche = NICHE_BY_ID.get(nicheId || '');
    if (niche && niche.faceless && W.nicheFaceless) add(W.nicheFaceless, 'nicho estruturalmente sem rosto');

    const threshold = Number(AI.threshold || 6);
    return {
      score: score,
      max: Number(AI.maxScore || 20),
      verdict: score >= threshold ? 'ai' : score >= Math.max(3, threshold - 3) ? 'maybe' : 'human',
      reasons: reasons,
      threshold: threshold,
    };
  }

  /**
   * taxonomy.json > overrides > "<channel_id>": { "niche": "tecnologia", "ai": true }
   * `ai` forces the Dark verdict; leaving it out keeps the heuristic's answer.
   */
  function applyOverride(channelId, base) {
    const ov = (TAXONOMY.overrides || {})[channelId];
    if (!ov) return base;
    const out = Object.assign({}, base);
    if (ov.niche) {
      const niche = NICHE_BY_ID.get(ov.niche);
      if (niche) {
        out.niche = niche.id;
        out.label = niche.label;
        out.score = 999;
        out.confidence = 'manual';
        out.runnerUp = base.label;
        out.overridden = true;
      }
    }
    if (typeof ov.ai === 'boolean') {
      out.aiForced = ov.ai;
      out.ai = ov.ai;
      out.aiReason = 'override manual em taxonomy.json';
    }
    return out;
  }

  /** Collapse the raw pieces into the three-state verdict both tools display. */
  function verdictOf(channel, videos, scan) {
    const cls = applyOverride(channel.channel_id || channel.channel, classifyChannel(channel.channel, videos));
    const ai = scoreAi(channel, videos, scan, cls.niche);
    const forced = cls.aiForced !== undefined;
    const isAi = forced ? cls.aiForced : ai.verdict === 'ai';
    return {
      niche: cls.niche,
      label: cls.label,
      confidence: cls.confidence,
      runnerUp: cls.runnerUp,
      overridden: !!cls.overridden,
      ai: isAi,
      aiVerdict: forced ? (isAi ? 'ai' : 'human') : ai.verdict,
      aiScore: forced ? (isAi ? ai.threshold : 0) : ai.score,
      aiMax: ai.max,
      aiThreshold: ai.threshold,
      aiReasons: forced ? ['override manual em taxonomy.json'] : ai.reasons,
    };
  }

  return { TAXONOMY, AI, NICHE_BY_ID, classifyChannel, scoreAi, applyOverride, verdictOf };
}
