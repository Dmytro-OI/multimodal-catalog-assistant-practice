import { catalog } from '../catalog/catalog.js';
import { createImageEmbedding, rankVisualCandidates } from '../clients/gemini.js';
import { config } from '../config.js';
import { downloadImage } from './enrichment.js';

export const searchByPhoto = async (queryImage) => {
  const embedding = await createImageEmbedding(queryImage);
  const candidates = await catalog.search(
    embedding,
    config.search.imageThreshold,
    config.search.imageCandidates,
  );
  if (!candidates.length) return { products: [], confidence: 0, explanation: '' };

  const comparable = [];
  for (const candidate of candidates.slice(0, 4)) {
    try {
      const image = await downloadImage(candidate.image_url);
      comparable.push({ ...candidate, ...image });
    } catch {}
  }

  if (comparable.length < 2) {
    return { products: candidates, confidence: candidates[0]?.similarity || 0, explanation: '' };
  }

  const ranking = await rankVisualCandidates({ queryImage, candidates: comparable });
  const bestId = Number(ranking.best_product_id);
  const orderedIds = [
    bestId,
    ...ranking.ranked_product_ids.map(Number).filter((id) => id !== bestId),
  ];
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  const products = [...candidates].sort((left, right) => {
    const leftRank = rank.get(Number(left.product_id)) ?? 999;
    const rightRank = rank.get(Number(right.product_id)) ?? 999;
    return leftRank - rightRank || right.similarity - left.similarity;
  });
  return {
    products,
    confidence: Math.max(0, Math.min(1, Number(ranking.confidence) || 0)),
    explanation: ranking.explanation || '',
  };
};
