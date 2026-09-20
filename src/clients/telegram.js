import { config } from '../config.js';

const apiUrl = (method) => `https://api.telegram.org/bot${config.telegram.token}/${method}`;

export const telegramRequest = async (method, payload = {}) => {
  const response = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error(`Telegram ${method} failed: ${result.description || response.statusText}`);
    error.status = Number(result.error_code || response.status);
    throw error;
  }
  return result.result;
};

export const sendMessage = (chatId, text, options = {}) => telegramRequest('sendMessage', {
  chat_id: chatId,
  text,
  parse_mode: 'HTML',
  disable_web_page_preview: true,
  ...options,
});

export const answerCallbackQuery = (callbackQueryId) => telegramRequest('answerCallbackQuery', {
  callback_query_id: callbackQueryId,
});

export const editMessageText = (chatId, messageId, text, options = {}) => telegramRequest('editMessageText', {
  chat_id: chatId,
  message_id: messageId,
  text,
  parse_mode: 'HTML',
  disable_web_page_preview: true,
  ...options,
});

export const sendPhoto = (chatId, photo, caption, options = {}) => telegramRequest('sendPhoto', {
  chat_id: chatId,
  photo,
  caption,
  parse_mode: 'HTML',
  ...options,
});

export const sendChatAction = (chatId, action) => telegramRequest('sendChatAction', {
  chat_id: chatId,
  action,
});

export const downloadTelegramPhoto = async (fileId) => {
  const file = await telegramRequest('getFile', { file_id: fileId });
  const response = await fetch(`https://api.telegram.org/file/bot${config.telegram.token}/${file.file_path}`);
  if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
  const extension = file.file_path?.split('.').pop()?.toLowerCase();
  const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
  return { imageBuffer: Buffer.from(await response.arrayBuffer()), mimeType };
};
