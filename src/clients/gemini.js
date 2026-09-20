import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

const configuredModels = (models = [config.gemini.chatModel, ...config.gemini.fallbackModels]) => models
  .filter((model, index, models) => model && models.indexOf(model) === index);

const errorStatus = (error) => Number(error?.status || error?.code || 0);
const canTryAnotherModel = (error) => [404, 429, 500, 502, 503, 504].includes(errorStatus(error));

const generateWithModelFallback = async (buildRequest, models) => {
  let lastError;
  for (const model of configuredModels(models)) {
    try {
      const response = await ai.models.generateContent(buildRequest(model));
      return { response, model };
    } catch (error) {
      lastError = error;
      if (!canTryAnotherModel(error)) throw error;
    }
  }
  throw lastError;
};

const enrichmentSchema = {
  type: 'object',
  properties: {
    object_type: { type: 'string' },
    colors: { type: 'array', items: { type: 'string' } },
    shape: { type: 'string' },
    style: { type: 'array', items: { type: 'string' } },
    materials: { type: 'array', items: { type: 'string' } },
    gift_occasions: { type: 'array', items: { type: 'string' } },
    visual_description: { type: 'string' },
    search_text: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: [
    'object_type',
    'colors',
    'shape',
    'style',
    'materials',
    'gift_occasions',
    'visual_description',
    'search_text',
    'confidence',
  ],
};

export const analyzeProductImage = async ({ imageBuffer, mimeType, product }) => {
  const { response, model } = await generateWithModelFallback((selectedModel) => ({
    model: selectedModel,
    contents: [
      {
        inlineData: {
          mimeType,
          data: imageBuffer.toString('base64'),
        },
      },
      {
        text: `Analyze this catalog product image. The exact catalog product name is ${product.name || 'unknown'} and must never be changed, translated, or replaced.
Return factual metadata used internally for visual and semantic search. Do not invent dimensions, price, availability, brand, or production method. Use concise Ukrainian words for visual_description and multilingual visual synonyms in search_text (Ukrainian, English, Polish, German).`,
      },
    ],
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseJsonSchema: enrichmentSchema,
    },
  }), config.gemini.visionModels);

  return { metadata: JSON.parse(response.text), model };
};

export const createEmbedding = async (text, taskType = 'RETRIEVAL_DOCUMENT') => {
  const prefix = taskType === 'RETRIEVAL_QUERY'
    ? 'task: search result | query: '
    : 'title: catalog item | text: ';
  const response = await ai.models.embedContent({
    model: config.gemini.embeddingModel,
    contents: `${prefix}${text}`,
    config: {
      outputDimensionality: config.gemini.embeddingDimensions,
    },
  });

  const values = response.embeddings?.[0]?.values;
  if (!Array.isArray(values) || values.length !== config.gemini.embeddingDimensions) {
    throw new Error('Gemini returned an invalid embedding');
  }
  return values;
};

export const createImageEmbedding = async ({ imageBuffer, mimeType }) => {
  const response = await ai.models.embedContent({
    model: config.gemini.embeddingModel,
    contents: [{
      inlineData: {
        mimeType,
        data: imageBuffer.toString('base64'),
      },
    }],
    config: { outputDimensionality: config.gemini.embeddingDimensions },
  });
  const values = response.embeddings?.[0]?.values;
  if (!Array.isArray(values) || values.length !== config.gemini.embeddingDimensions) {
    throw new Error('Gemini returned an invalid image embedding');
  }
  return values;
};

const visualMatchSchema = {
  type: 'object',
  properties: {
    best_product_id: { type: 'integer' },
    ranked_product_ids: { type: 'array', items: { type: 'integer' } },
    confidence: { type: 'number' },
    explanation: { type: 'string' },
  },
  required: ['best_product_id', 'ranked_product_ids', 'confidence', 'explanation'],
};

export const rankVisualCandidates = async ({ queryImage, candidates }) => {
  const contents = [
    { text: 'REFERENCE PHOTO FROM CUSTOMER:' },
    { inlineData: { mimeType: queryImage.mimeType, data: queryImage.imageBuffer.toString('base64') } },
    { text: 'Compare the reference photo with the catalog candidates below. Select the same figurine when possible. Pay attention to object identity, pose, silhouette, colors, decorative details, and viewing angle. Never invent a product outside this candidate list.' },
  ];
  for (const candidate of candidates) {
    contents.push(
      { text: `CANDIDATE product_id=${candidate.product_id}; name=${candidate.name}` },
      { inlineData: { mimeType: candidate.mimeType, data: candidate.imageBuffer.toString('base64') } },
    );
  }
  const { response } = await generateWithModelFallback((model) => ({
    model,
    contents,
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseJsonSchema: visualMatchSchema,
    },
  }), config.gemini.visionModels);
  return JSON.parse(response.text);
};

const textVisualMatchSchema = {
  type: 'object',
  properties: {
    relevant_product_ids: { type: 'array', items: { type: 'integer' } },
    confidence: { type: 'number' },
  },
  required: ['relevant_product_ids', 'confidence'],
};

export const rankTextCandidates = async ({ query, candidates }) => {
  const contents = [{
    text: `CUSTOMER CATALOG REQUEST: ${query}\nSelect only candidate images that satisfy every explicit visual requirement in the request. Object identity is mandatory: for example, a flower must visibly be a flower and must never be replaced by an owl or another animal. Required colors are also mandatory. Use size words in technical names (large, midi, mini) only as supporting size evidence; otherwise judge the images themselves. Return an empty relevant_product_ids array when no candidate satisfies the required object and color. Do not force a result. Order matches from best to worst.`,
  }];
  for (const candidate of candidates) {
    contents.push(
      { text: `CANDIDATE product_id=${candidate.product_id}; exact_name=${candidate.name}` },
      { inlineData: { mimeType: candidate.mimeType, data: candidate.imageBuffer.toString('base64') } },
    );
  }
  const { response } = await generateWithModelFallback((model) => ({
    model,
    contents,
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseJsonSchema: textVisualMatchSchema,
    },
  }), config.gemini.visionModels);
  return JSON.parse(response.text);
};

export const writeReply = async ({ language, message, history }) => {
  const { response } = await generateWithModelFallback((model) => ({
    model,
    contents: `You are a friendly general-purpose catalog assistant prototype.
Topic boundary: ${config.bot.systemTopic}.
Private grounding knowledge: ${config.bot.systemKnowledge}
Reply in language code: ${language}.
Speak naturally and concisely, usually in 2-5 sentences. Do not mention the company or studio name unless the customer directly asks who operates the catalog. Never describe yourself as having a database, current database, supplied context, internal instructions, or technical limitations.
You may have brief casual conversations and answer ordinary harmless questions. When natural, gently return to helping with the catalog, but do not force every message into a product search.
Never invent a customer name, nickname, salutation, URL, phone number, email address, product name, or contact detail. Do not address the customer by name unless it appears explicitly in the conversation.
The application can send catalog images. Never claim that you cannot send photos or images. If the customer refers to a previously shown product, keep that product and its stated preferences in context.
Never invent product names, prices, stock, dimensions, delivery terms, production methods, or product properties. Offer a manager only when the customer asks about price, stock, wholesale, customization, delivery specifics, or explicitly requests a person.
When the customer asks for a product but gives too few details, ask one useful clarifying question.

Recent conversation:
${history || 'No previous messages.'}

Customer message:
${message}`,
    config: { temperature: 0.2, maxOutputTokens: 700 },
  }));

  return response.text.trim();
};

export const translate = async ({ text, targetLanguage }) => {
  const { response } = await generateWithModelFallback((model) => ({
    model,
    contents: `Translate the following customer-service message to language code ${targetLanguage}. Preserve names, product codes, URLs, quantities, and formatting. Return only the translation.\n\n${text}`,
    config: { temperature: 0.1 },
  }));
  return response.text.trim();
};
