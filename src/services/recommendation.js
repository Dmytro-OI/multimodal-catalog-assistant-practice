import { config } from '../config.js';
import { rankTextCandidates } from '../clients/gemini.js';
import { downloadImage } from './enrichment.js';
import { searchProducts } from './search.js';

export const recommend = async (query, { excludeIds = [] } = {}) => {
  const excluded = new Set(excludeIds.map(Number));
  const matches = await searchProducts(query, {
    threshold: config.search.recommendationThreshold,
    count: Math.min(20, 8 + excluded.size),
  });
  const candidates = matches.filter((product) => !excluded.has(Number(product.product_id))).slice(0, 8);
  if (!candidates.length) return [];

  const comparable = [];
  for (const candidate of candidates.slice(0, 8)) {
    try {
      const image = await downloadImage(candidate.image_url);
      comparable.push({ ...candidate, ...image });
    } catch {}
  }
  if (!comparable.length) return [];

  const ranking = await rankTextCandidates({ query, candidates: comparable });
  if (Number(ranking.confidence) < 0.45) return [];
  const byId = new Map(candidates.map((product) => [Number(product.product_id), product]));
  return (ranking.relevant_product_ids || [])
    .map(Number)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, 3);
};
