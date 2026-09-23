import { supabase } from '../clients/supabase.js';

export const ensureTelegramUser = async (telegramUser, database = supabase) => {
  const { data, error } = await database.from('assistant_users').upsert({
    telegram_user_id: String(telegramUser.id),
    telegram_username: telegramUser.username || null,
    display_name: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'telegram_user_id', ignoreDuplicates: false }).select('*').single();
  if (error) throw error;
  return data;
};

export const setUserLanguage = async (telegramUserId, language) => {
  const { error } = await supabase.from('assistant_users')
    .update({ language, updated_at: new Date().toISOString() })
    .eq('telegram_user_id', String(telegramUserId));
  if (error) throw error;
};

export const recordMessage = async ({ userId, telegramChatId, direction, senderType, text, language, telegramMessageId }) => {
  const { error } = await supabase.from('assistant_messages').insert({
    user_id: userId,
    telegram_chat_id: String(telegramChatId),
    direction,
    sender_type: senderType,
    text,
    language,
    telegram_message_id: telegramMessageId || null,
  });
  if (error) throw error;
};

const getLatestSessionStart = async (userId) => {
  const { data, error } = await supabase.from('assistant_messages')
    .select('created_at')
    .eq('user_id', userId)
    .eq('direction', 'system')
    .eq('text', 'session:start')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at || null;
};

export const getRecentHistory = async (userId, limit = 8) => {
  const sessionStartedAt = await getLatestSessionStart(userId);
  let query = supabase.from('assistant_messages')
    .select('sender_type,text,created_at')
    .eq('user_id', userId)
    .in('sender_type', ['customer', 'assistant', 'manager']);
  if (sessionStartedAt) query = query.gte('created_at', sessionStartedAt);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).reverse().map((item) => `${item.sender_type}: ${item.text}`).join('\n');
};

export const getRecentPhotoSearchContext = async (userId, maxAgeMs = 30 * 60_000) => {
  const sessionStartedAt = await getLatestSessionStart(userId);
  let query = supabase.from('assistant_messages')
    .select('text,created_at')
    .eq('user_id', userId)
    .eq('direction', 'system')
    .like('text', 'photo-search:%');
  if (sessionStartedAt) query = query.gte('created_at', sessionStartedAt);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || Date.now() - new Date(data.created_at).getTime() > maxAgeMs) return null;
  try {
    return JSON.parse(data.text.slice('photo-search:'.length));
  } catch {
    return null;
  }
};

export const recordPhotoSearchContext = async ({ userId, telegramChatId, language, candidateIds, shownCount }) => recordMessage({
  userId,
  telegramChatId,
  direction: 'system',
  senderType: 'system',
  text: `photo-search:${JSON.stringify({ candidateIds, shownCount })}`,
  language,
});

export const getUserMode = async (userId) => {
  const { data, error } = await supabase.from('assistant_messages')
    .select('text')
    .eq('user_id', userId)
    .eq('direction', 'system')
    .like('text', 'mode:%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const mode = data?.text?.replace('mode:', '');
  return ['search', 'chat', 'support', 'photo'].includes(mode) ? mode : 'chat';
};

export const createSupportRequest = async ({ userId, telegramChatId, message }) => {
  const { data, error } = await supabase.from('assistant_support_requests').insert({
    user_id: userId,
    telegram_chat_id: String(telegramChatId),
    initial_message: message,
    status: 'open',
  }).select('*').single();
  if (error) throw error;
  return data;
};

export const findOpenSupportRequest = async (userId, telegramChatId) => {
  const { data, error } = await supabase.from('assistant_support_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('telegram_chat_id', String(telegramChatId))
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const closeOpenSupportRequests = async (userId, telegramChatId) => {
  const { data, error } = await supabase.from('assistant_support_requests')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('telegram_chat_id', String(telegramChatId))
    .eq('status', 'open')
    .select('id');
  if (error) throw error;
  return data || [];
};

export const startConversationSession = async ({ userId, telegramChatId, language }) => {
  const closedRequests = await closeOpenSupportRequests(userId, telegramChatId);
  await recordMessage({
    userId, telegramChatId, direction: 'system', senderType: 'system', text: 'session:start', language,
  });
  await recordMessage({
    userId, telegramChatId, direction: 'system', senderType: 'system', text: 'mode:chat', language,
  });
  return closedRequests;
};

export const closeSupportRequestById = async (requestId) => {
  const { data: request, error: findError } = await supabase
    .from('assistant_support_requests')
    .select('*,assistant_users(*)')
    .eq('id', requestId)
    .eq('status', 'open')
    .maybeSingle();
  if (findError) throw findError;
  if (!request) return null;
  const { error: closeError } = await supabase.from('assistant_support_requests')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'open');
  if (closeError) throw closeError;
  return request;
};

export const findSupportRequestByAdminMessage = async (adminTelegramId, adminMessageId) => {
  const { data, error } = await supabase.from('assistant_support_notifications')
    .select('support_request_id,assistant_support_requests(*,assistant_users(*))')
    .eq('admin_telegram_id', String(adminTelegramId))
    .eq('telegram_message_id', adminMessageId)
    .maybeSingle();
  if (error) throw error;
  const relation = data?.assistant_support_requests;
  const request = Array.isArray(relation) ? relation[0] : relation;
  return request?.status === 'open' ? request : null;
};

export const attachAdminNotification = async (requestId, adminTelegramId, messageId) => {
  const { error } = await supabase.from('assistant_support_notifications').insert({
    support_request_id: requestId,
    admin_telegram_id: String(adminTelegramId),
    telegram_message_id: messageId,
  });
  if (error) throw error;
};
