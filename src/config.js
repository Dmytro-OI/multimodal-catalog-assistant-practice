import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  override: process.env.NODE_ENV !== 'production',
});

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const number = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name}`);
  return value;
};

const integer = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || fallback, 10);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
};

const list = (value = '') => value.split(',').map((item) => item.trim()).filter(Boolean);

export const config = {
  port: integer('PORT', 3100),
  publicBaseUrl: process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || '',
  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    imageBucket: process.env.SUPABASE_IMAGE_BUCKET || 'images',
  },
  telegram: {
    token: required('TELEGRAM_BOT_TOKEN'),
    webhookSecret: required('TELEGRAM_WEBHOOK_SECRET'),
    adminIds: new Set(list(process.env.ADMIN_TELEGRAM_IDS).map(String)),
  },
  gemini: {
    apiKey: required('GEMINI_API_KEY'),
    chatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite',
    fallbackModels: list(process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash,gemini-3.6-flash,gemini-3.8-flash'),
    visionModels: list(process.env.GEMINI_VISION_MODELS || 'gemini-3.5-flash-lite,gemini-3.5-flash'),
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
    embeddingDimensions: integer('EMBEDDING_DIMENSIONS', 768),
  },
  bot: {
    defaultLanguage: 'uk',
    supportedLanguages: ['uk', 'en', 'pl', 'de'],
    systemTopic: 'glass products, figurines, souvenirs, decor, and gifts',
    systemKnowledge: 'This is a catalog bot demonstrated on glass products. Product names are exact technical identifiers. Do not invent prices, availability, contacts, dimensions, delivery terms, or product properties.',
  },
  search: {
    threshold: number('MATCH_THRESHOLD', 0.42),
    recommendationThreshold: number('RECOMMENDATION_MATCH_THRESHOLD', 0.28),
    count: integer('MATCH_COUNT', 5),
    imageThreshold: number('IMAGE_MATCH_THRESHOLD', 0.35),
    imageCandidates: integer('IMAGE_MATCH_CANDIDATES', 5),
  },
  enrichment: {
    batchSize: integer('ENRICHMENT_BATCH_SIZE', 5),
    pageSize: integer('ENRICHMENT_PAGE_SIZE', 100),
    delayMs: integer('ENRICHMENT_DELAY_MS', 5000),
    maxRetries: integer('ENRICHMENT_MAX_RETRIES', 3),
    retryBaseDelayMs: integer('ENRICHMENT_RETRY_BASE_DELAY_MS', 5000),
    retryMaxDelayMs: integer('ENRICHMENT_RETRY_MAX_DELAY_MS', 60000),
  },
  indexing: {
    batchSize: integer('IMAGE_INDEX_BATCH_SIZE', 900),
    delayMs: integer('IMAGE_INDEX_DELAY_MS', 1000),
    concurrency: integer('IMAGE_INDEX_CONCURRENCY', 3),
  },
};
