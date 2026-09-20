import { config } from '../src/config.js';
import { telegramRequest } from '../src/clients/telegram.js';

if (!config.publicBaseUrl.startsWith('https://')) {
  throw new Error('PUBLIC_BASE_URL must be a public HTTPS URL');
}

const webhookUrl = `${config.publicBaseUrl}/webhooks/telegram`;
const result = await telegramRequest('setWebhook', {
  url: webhookUrl,
  secret_token: config.telegram.webhookSecret,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: false,
});

console.log(`Webhook configured: ${webhookUrl}`, result);
