import { analyzeProductImage, createImageEmbedding } from '../clients/gemini.js';
import { catalog } from '../catalog/catalog.js';
import { config } from '../config.js';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const imageCache = new Map();
const IMAGE_CACHE_MAX_ENTRIES = 256;
const IMAGE_CACHE_MAX_ITEM_BYTES = 256 * 1024;

const readCachedImage = (url) => {
  const cached = imageCache.get(url);
  if (!cached) return null;
  imageCache.delete(url);
  imageCache.set(url, cached);
  return cached;
};

const cacheImage = (url, image) => {
  if (image.imageBuffer.length > IMAGE_CACHE_MAX_ITEM_BYTES) return;
  imageCache.set(url, image);
  while (imageCache.size > IMAGE_CACHE_MAX_ENTRIES) {
    imageCache.delete(imageCache.keys().next().value);
  }
};

export const getErrorStatus = (error) => Number(error?.status || error?.code || 0);

export const isTransientError = (error) => {
  const status = getErrorStatus(error);
  return [408, 429, 500, 502, 503, 504].includes(status)
    || /timeout|timed out|fetch failed|ECONNRESET|ENOTFOUND/i.test(String(error?.message || ''));
};

const retry = async (operation) => {
  let lastError;
  for (let attempt = 0; attempt < config.enrichment.maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === config.enrichment.maxRetries - 1) throw error;
      const exponential = config.enrichment.retryBaseDelayMs * (2 ** attempt);
      const jitter = Math.floor(Math.random() * 1000);
      await sleep(Math.min(exponential + jitter, config.enrichment.retryMaxDelayMs));
    }
  }
  throw lastError;
};

export const downloadImage = async (url) => {
  const cached = readCachedImage(url);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`Image download failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  if (!mimeType.startsWith('image/')) throw new Error(`Unsupported image type: ${mimeType}`);
  const image = { imageBuffer: Buffer.from(await response.arrayBuffer()), mimeType };
  cacheImage(url, image);
  return image;
};

export const enrichProduct = async (product) => {
  let stage = 'vision';
  try {
    const previous = product.aiMetadata;
    const sameImage = previous?.source_image_path === product.image_path;
    let image;
    let metadata = sameImage && previous?.ai_description && previous?.search_text
      && Number(previous?.attributes?.metadata_version || 0) >= 3
      ? previous.attributes
      : null;

    if (!metadata) {
      image = await retry(() => downloadImage(product.image_url));
      const analyzed = await retry(() => analyzeProductImage({ ...image, product }));
      metadata = {
        ...analyzed.metadata,
        metadata_version: 3,
        embedding_basis: 'image-v1',
        index_mode: 'image+metadata',
      };
      await catalog.saveVisionMetadata(product, metadata, analyzed.model);
    } else if (metadata.embedding_basis !== 'image-v1') {
      metadata = { ...metadata, embedding_basis: 'image-v1', index_mode: 'image+metadata' };
      await catalog.saveVisionMetadata(
        product,
        metadata,
        previous?.vision_model || config.gemini.visionModels[0],
      );
    }

    stage = 'embedding';
    image ||= await retry(() => downloadImage(product.image_url));
    const embedding = await retry(() => createImageEmbedding(image));
    await catalog.saveEmbedding(product.id, embedding);
    return { productId: product.id, status: 'ready' };
  } catch (error) {
    const transient = isTransientError(error);
    await catalog.markFailed(product, stage, error.message, transient);
    return { productId: product.id, status: transient ? 'deferred' : 'failed', stage, error: error.message };
  }
};

export const enrichProducts = async (limit) => {
  const results = [];
  let afterId = 0;
  let exhausted = false;

  while (results.length < limit && !exhausted) {
    const products = await catalog.listProductsForEnrichment({
      afterId,
      limit: config.enrichment.pageSize,
    });
    exhausted = products.length < config.enrichment.pageSize;

    for (const product of products) {
      afterId = product.id;
      const previous = product.aiMetadata;
      const sameImage = previous?.source_image_path === product.image_path;
      const failedPermanently = sameImage && previous?.processing_status === 'failed'
        && previous?.processing_error?.startsWith('[permanent:');
      const retryCoolingDown = sameImage && previous?.processing_status === 'failed'
        && previous?.processing_error?.startsWith('[retry:')
        && Date.now() - new Date(previous.processed_at).getTime() < 30 * 60_000;
      const currentIndex = sameImage && previous?.processing_status === 'ready'
        && previous?.ai_description
        && previous?.search_text
        && previous?.vision_model
        && Number(previous?.attributes?.metadata_version || 0) >= 3
        && previous?.attributes?.embedding_basis === 'image-v1';
      if (currentIndex || failedPermanently || retryCoolingDown) continue;

      results.push(await enrichProduct(product));
      if (results.length >= limit) break;
      await sleep(config.enrichment.delayMs);
    }
  }
  return { results, nextProductId: afterId, exhausted };
};
