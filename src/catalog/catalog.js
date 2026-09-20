import { config } from '../config.js';
import { supabase } from '../clients/supabase.js';

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value || '');

const resolveImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (isAbsoluteUrl(imagePath)) return imagePath;
  const prefix = `${config.supabase.imageBucket}/`;
  const path = imagePath.startsWith(prefix) ? imagePath.slice(prefix.length) : imagePath;
  return supabase.storage.from(config.supabase.imageBucket).getPublicUrl(path).data.publicUrl;
};

const assistantImagePath = (product) => product.image_thumb_path || product.image_path;

const withCatalogFields = (product) => {
  if (!product) return null;
  const relation = product.product_ai_metadata;
  const aiMetadata = Array.isArray(relation) ? relation[0] : relation;
  return {
    ...product,
    ...(aiMetadata || {}),
    image_url: resolveImageUrl(assistantImagePath(product)),
  };
};

export const catalog = {
  async getCatalogCount() {
    const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  },

  async findByExactName(name) {
    const { data, error } = await supabase
      .from('products')
      .select('id,name,image_path,image_thumb_path,product_ai_metadata(product_id,ai_description,search_text,attributes,vision_model,processing_status)')
      .ilike('name', name)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return withCatalogFields(data);
  },

  async findByIds(ids) {
    if (!ids.length) return [];
    const { data, error } = await supabase
      .from('products')
      .select('id,name,image_path,image_thumb_path,product_ai_metadata(product_id,ai_description,search_text,attributes,vision_model,processing_status)')
      .in('id', ids);
    if (error) throw error;
    const byId = new Map((data || []).map((product) => [Number(product.id), withCatalogFields(product)]));
    return ids.map(Number).map((id) => byId.get(id)).filter(Boolean);
  },

  async listProductsForEnrichment({ afterId = 0, limit = 100 }) {
    const { data, error } = await supabase
      .from('products')
      .select('id,name,image_path,image_thumb_path,product_ai_metadata(product_id,ai_description,search_text,attributes,vision_model,embedding_model,embedding_dimensions,processing_status,processing_error,source_image_path,processed_at)')
      .not('image_path', 'is', null)
      .gt('id', afterId)
      .order('id', { ascending: true })
      .limit(limit);

    if (error) throw error;

    return (data || []).map((product) => {
      const relation = product.product_ai_metadata;
      const aiMetadata = Array.isArray(relation) ? relation[0] : relation;
      return {
        ...product,
        aiMetadata: aiMetadata || null,
        image_url: resolveImageUrl(assistantImagePath(product)),
      };
    });
  },

  async saveVisionMetadata(product, metadata, visionModel) {
    const payload = {
      product_id: product.id,
      ai_description: metadata.visual_description,
      search_text: metadata.search_text,
      attributes: metadata,
      vision_model: visionModel,
      confidence: metadata.confidence,
      source_image_path: product.image_path,
      processing_status: 'processing',
      processing_error: null,
      processed_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('product_ai_metadata').upsert(payload, { onConflict: 'product_id' });
    if (error) throw error;
  },

  async saveEmbedding(productId, embedding) {
    const { error } = await supabase.from('product_ai_metadata').upsert({
      product_id: productId,
      embedding,
      embedding_model: config.gemini.embeddingModel,
      embedding_dimensions: config.gemini.embeddingDimensions,
      processing_status: 'ready',
      processing_error: null,
      processed_at: new Date().toISOString(),
    }, { onConflict: 'product_id' });
    if (error) throw error;
  },

  async saveImageIndex(product, embedding) {
    const { error } = await supabase.from('product_ai_metadata').upsert({
      product_id: product.id,
      attributes: {
        ...(product.aiMetadata?.attributes || {}),
        metadata_version: Number(product.aiMetadata?.attributes?.metadata_version || 3),
        embedding_basis: 'image-v1',
        index_mode: product.aiMetadata?.ai_description ? 'image+metadata' : 'image-only',
      },
      embedding,
      embedding_model: config.gemini.embeddingModel,
      embedding_dimensions: config.gemini.embeddingDimensions,
      source_image_path: product.image_path,
      processing_status: 'ready',
      processing_error: null,
      processed_at: new Date().toISOString(),
    }, { onConflict: 'product_id' });
    if (error) throw error;
  },

  async markFailed(product, stage, errorMessage, transient) {
    const { error } = await supabase.from('product_ai_metadata').upsert({
      product_id: product.id,
      source_image_path: product.image_path,
      processing_status: 'failed',
      processing_error: `[${transient ? 'retry' : 'permanent'}:${stage}] ${String(errorMessage)}`.slice(0, 2000),
      processed_at: new Date().toISOString(),
    }, { onConflict: 'product_id' });
    if (error) throw error;
  },

  async search(queryEmbedding, threshold, count) {
    const { data, error } = await supabase.rpc('match_catalog_products', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: count,
    });
    if (error) throw error;
    const matches = data || [];
    if (!matches.length) return [];

    const ids = matches.map((product) => product.product_id);
    const { data: imageRows, error: imageError } = await supabase
      .from('products')
      .select('id,image_path,image_thumb_path')
      .in('id', ids);
    if (imageError) throw imageError;
    const imagesById = new Map((imageRows || []).map((product) => [Number(product.id), product]));

    return matches.map((product) => {
      const imageFields = imagesById.get(Number(product.product_id)) || product;
      return {
        ...product,
        image_url: resolveImageUrl(assistantImagePath(imageFields)),
      };
    });
  },
};
