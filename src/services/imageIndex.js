import { createImageEmbedding } from '../clients/gemini.js';
import { catalog } from '../catalog/catalog.js';
import { config } from '../config.js';
import { downloadImage, isTransientError } from './enrichment.js';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isCurrentImageIndex = (product) => {
  const metadata = product.aiMetadata;
  if (metadata?.processing_status !== 'ready') return false;
  if (metadata?.source_image_path !== product.image_path) return false;
  if (metadata?.embedding_model !== config.gemini.embeddingModel) return false;
  if (Number(metadata?.embedding_dimensions) !== config.gemini.embeddingDimensions) return false;
  return metadata?.attributes?.embedding_basis === 'image-v1';
};

export const indexProductImage = async (product) => {
  try {
    const image = await downloadImage(product.image_url);
    const embedding = await createImageEmbedding(image);
    await catalog.saveImageIndex(product, embedding);
    return { productId: product.id, status: 'ready' };
  } catch (error) {
    const transient = isTransientError(error);
    await catalog.markFailed(product, 'image-index', error.message, transient);
    return {
      productId: product.id,
      status: transient ? 'deferred' : 'failed',
      error: error.message,
    };
  }
};

export const indexImages = async (limit = config.indexing.batchSize) => {
  const results = [];
  let afterId = 0;
  let exhausted = false;

  while (results.length < limit && !exhausted) {
    const products = await catalog.listProductsForEnrichment({
      afterId,
      limit: config.enrichment.pageSize,
    });
    exhausted = products.length < config.enrichment.pageSize;

    const remaining = limit - results.length;
    const pendingOnPage = products.filter((product) => !isCurrentImageIndex(product));
    const pending = pendingOnPage.slice(0, remaining);
    if (pendingOnPage.length > remaining) exhausted = false;
    for (let index = 0; index < pending.length; index += config.indexing.concurrency) {
      const group = pending.slice(index, index + config.indexing.concurrency);
      results.push(...await Promise.all(group.map(indexProductImage)));
      afterId = group.at(-1).id;
      if (results.length >= limit) break;
      await sleep(config.indexing.delayMs);
    }
    if (results.length < limit && products.length) afterId = products.at(-1).id;
  }

  return { results, nextProductId: afterId, exhausted };
};
