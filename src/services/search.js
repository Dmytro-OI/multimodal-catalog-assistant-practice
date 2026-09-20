import { config } from '../config.js';
import { createEmbedding } from '../clients/gemini.js';
import { catalog } from '../catalog/catalog.js';

export const searchProducts = async (query, { threshold = config.search.threshold, count = config.search.count } = {}) => {
  const embedding = await createEmbedding(query, 'RETRIEVAL_QUERY');
  return catalog.search(embedding, threshold, count);
};
