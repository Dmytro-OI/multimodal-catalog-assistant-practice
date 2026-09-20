import { config } from '../config.js';
import {
  answerCallbackQuery,
  downloadTelegramPhoto,
  editMessageText,
  sendChatAction,
  sendMessage,
  sendPhoto,
} from '../clients/telegram.js';
import { writeReply, translate } from '../clients/gemini.js';
import { searchByPhoto } from '../services/photoSearch.js';
import { recommend } from '../services/recommendation.js';
import { catalog } from '../catalog/catalog.js';
import {
  buildCatalogQuery,
  extractProductCode,
  extractRecentProductCode,
  isCatalogCountRequest,
  isGreeting,
  isMenuRequest,
  isPhotoAlternativeRequest,
  isPhotoRequest,
  isPhoneRequest,
  isPriceRequest,
  isSupportRequest,
  isWebsiteRequest,
  isVisualRefinementRequest,
  shouldSearchCatalog,
} from '../services/intent.js';
import {
  attachAdminNotification,
  closeOpenSupportRequests,
  closeSupportRequestById,
  createSupportRequest,
  ensureTelegramUser,
  findOpenSupportRequest,
  findSupportRequestByAdminMessage,
  getRecentHistory,
  getRecentPhotoSearchContext,
  getUserMode,
  recordMessage,
  recordPhotoSearchContext,
  setUserLanguage,
} from '../services/chat.js';

const languageMenu = {
  inline_keyboard: [[
    { text: 'Українська', callback_data: 'lang:uk' },
    { text: 'English', callback_data: 'lang:en' },
  ], [
    { text: 'Polski', callback_data: 'lang:pl' },
    { text: 'Deutsch', callback_data: 'lang:de' },
  ]],
};

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const localizedText = (language, texts) => texts[language] || texts.uk;

const capabilitiesText = (language) => localizedText(language, {
  uk: 'Вітаю! Я — AI-помічник демонстраційного каталогу.\n\nМожу підібрати виріб за описом або побажаннями, показати його фото, впізнати товар за фотографією та підключити менеджера.\n\nНапишіть, наприклад: «Порадь подарунок людині, яка любить природу» — або просто надішліть фото.',
  en: 'Hello! I am an AI assistant for a demonstration catalog.\n\nI can recommend an item from a description or preferences, show its photo, identify a product from a photo, and connect you with a manager.\n\nFor example, write: “Suggest a gift for someone who loves nature” — or simply send a photo.',
  pl: 'Cześć! Jestem asystentem AI katalogu demonstracyjnego.\n\nMogę dobrać produkt na podstawie opisu lub preferencji, pokazać zdjęcie, rozpoznać produkt ze zdjęcia i połączyć z menedżerem.\n\nNapisz na przykład: „Poleć prezent dla osoby, która lubi przyrodę” — albo po prostu wyślij zdjęcie.',
  de: 'Hallo! Ich bin ein KI-Assistent für einen Demonstrationskatalog.\n\nIch kann anhand einer Beschreibung oder von Vorlieben einen Artikel empfehlen, sein Foto zeigen, ein Produkt auf einem Foto erkennen und einen Mitarbeiter verbinden.\n\nSchreiben Sie zum Beispiel: „Empfiehl ein Geschenk für jemanden, der die Natur liebt“ — oder senden Sie einfach ein Foto.',
});

const languageSelectedText = (language) => localizedText(language, {
  uk: '✅ Мову вибрано: українська.',
  en: '✅ Language selected: English.',
  pl: '✅ Wybrany język: polski.',
  de: '✅ Sprache ausgewählt: Deutsch.',
});

const languageWelcomeText = '👋 Вітаю! Оберіть мову спілкування.\nWelcome! Choose your language.\nWybierz język. · Sprache wählen.';

const temporaryUnavailableText = (language) => localizedText(language, {
  uk: 'Вибачте, AI-пошук тимчасово недоступний через обмеження сервісу. Спробуйте, будь ласка, трохи пізніше.',
  en: 'Sorry, AI search is temporarily unavailable due to a service limit. Please try again a little later.',
  pl: 'Przepraszam, wyszukiwanie AI jest tymczasowo niedostępne z powodu limitu usługi. Spróbuj ponownie nieco później.',
  de: 'Entschuldigung, die KI-Suche ist wegen eines Dienstlimits vorübergehend nicht verfügbar. Bitte versuchen Sie es etwas später erneut.',
});

const supportEndMenu = (language) => ({
  inline_keyboard: [[{
    text: localizedText(language, {
      uk: '✅ Завершити діалог із менеджером',
      en: '✅ End manager conversation',
      pl: '✅ Zakończ rozmowę z menedżerem',
      de: '✅ Gespräch mit Mitarbeiter beenden',
    }),
    callback_data: 'support:end',
  }]],
});

const supportStartMenu = (language) => ({
  inline_keyboard: [[{
    text: localizedText(language, {
      uk: '👤 Написати менеджеру',
      en: '👤 Message a manager',
      pl: '👤 Napisz do menedżera',
      de: '👤 Mitarbeiter kontaktieren',
    }),
    callback_data: 'mode:support',
  }]],
});

const managerCloseMenu = (requestId) => ({
  inline_keyboard: [[{
    text: '✅ Завершити діалог',
    callback_data: `manager:close:${requestId}`,
  }]],
});

const sendProductCards = async (chatId, products) => {
  for (const product of products.slice(0, 3)) {
    const name = product.name;
    const caption = `<b>${escapeHtml(name)}</b>`;
    if (product.image_url) {
      try {
        await sendPhoto(chatId, product.image_url, caption);
      } catch {
        await sendMessage(chatId, caption);
      }
    } else {
      await sendMessage(chatId, caption);
    }
  }
};

const handleAdminReply = async (message) => {
  if (!config.telegram.adminIds.has(String(message.from.id)) || !message.reply_to_message || !message.text) return false;
  const supportRequest = await findSupportRequestByAdminMessage(
    message.from.id,
    message.reply_to_message.message_id,
  );
  if (!supportRequest) {
    await sendMessage(message.chat.id, 'Цей діалог уже завершено або повідомлення не пов’язане з активним зверненням.');
    return true;
  }
  const userRelation = supportRequest.assistant_users;
  const supportUser = Array.isArray(userRelation) ? userRelation[0] : userRelation;
  const language = supportUser?.language || config.bot.defaultLanguage;
  const translated = language === config.bot.defaultLanguage
    ? message.text
    : await translate({ text: message.text, targetLanguage: language });
  await sendMessage(supportRequest.telegram_chat_id, escapeHtml(translated), {
    reply_markup: supportEndMenu(language),
  });
  await recordMessage({
    userId: supportRequest.user_id,
    telegramChatId: supportRequest.telegram_chat_id,
    direction: 'outbound',
    senderType: 'manager',
    text: translated,
    language,
    telegramMessageId: message.message_id,
  });
  await sendMessage(message.chat.id, '✅ Відповідь надіслано клієнту.');
  return true;
};

const handleCallback = async (callback) => {
  await answerCallbackQuery(callback.id);
  const chatId = callback.message.chat.id;
  if (callback.data.startsWith('manager:close:')) {
    if (!config.telegram.adminIds.has(String(callback.from.id))) return;
    const requestId = Number(callback.data.slice('manager:close:'.length));
    const request = await closeSupportRequestById(requestId);
    if (!request) {
      await sendMessage(chatId, 'Цей діалог уже завершено.');
      return;
    }
    const userRelation = request.assistant_users;
    const supportUser = Array.isArray(userRelation) ? userRelation[0] : userRelation;
    const language = supportUser?.language || config.bot.defaultLanguage;
    await recordMessage({
      userId: request.user_id,
      telegramChatId: request.telegram_chat_id,
      direction: 'system',
      senderType: 'system',
      text: 'mode:chat',
      language,
    });
    await sendMessage(request.telegram_chat_id, localizedText(language, {
      uk: '✅ Менеджер завершив діалог. Тепер знову відповідає асистент.',
      en: '✅ The manager ended the conversation. The assistant is active again.',
      pl: '✅ Menedżer zakończył rozmowę. Asystent jest ponownie aktywny.',
      de: '✅ Der Mitarbeiter hat das Gespräch beendet. Der Assistent ist wieder aktiv.',
    }));
    await sendMessage(chatId, `✅ Звернення #${request.id} завершено.`);
    return;
  }
  const telegramUser = await ensureTelegramUser(callback.from);
  if (callback.data === 'support:end') {
    const closedRequests = await closeOpenSupportRequests(telegramUser.id, chatId);
    await recordMessage({
      userId: telegramUser.id,
      telegramChatId: chatId,
      direction: 'system',
      senderType: 'system',
      text: 'mode:chat',
      language: telegramUser.language,
    });
    await sendMessage(chatId, localizedText(telegramUser.language, {
      uk: '✅ Діалог із менеджером завершено. Тепер знову відповідає асистент.',
      en: '✅ The manager conversation is closed. The assistant is active again.',
      pl: '✅ Rozmowa z menedżerem została zakończona. Asystent jest ponownie aktywny.',
      de: '✅ Das Gespräch mit dem Mitarbeiter wurde beendet. Der Assistent ist wieder aktiv.',
    }));
    for (const request of closedRequests) {
      for (const adminId of config.telegram.adminIds) {
        await sendMessage(adminId, `ℹ️ Клієнт завершив звернення #${request.id}.`);
      }
    }
    return;
  }
  if (callback.data === 'mode:language') {
    await sendMessage(chatId, 'Оберіть мову:', { reply_markup: languageMenu });
    return;
  }
  if (callback.data.startsWith('lang:')) {
    const language = callback.data.slice(5);
    if (config.bot.supportedLanguages.includes(language)) {
      await setUserLanguage(callback.from.id, language);
      await editMessageText(chatId, callback.message.message_id, languageSelectedText(language), {
        reply_markup: { inline_keyboard: [] },
      });
      await sendMessage(chatId, capabilitiesText(language));
    }
    return;
  }
  const mode = callback.data.replace('mode:', '');
  if (!['search', 'chat', 'support', 'photo'].includes(mode)) return;
  const prompts = {
    search: localizedText(telegramUser.language, {
      uk: 'Опишіть, який товар ви шукаєте.', en: 'Describe the product you are looking for.', pl: 'Opisz produkt, którego szukasz.', de: 'Beschreiben Sie das gesuchte Produkt.',
    }),
    photo: localizedText(telegramUser.language, {
      uk: 'Надішліть фотографію товару — я порівняю її з каталогом.', en: 'Send a product photo and I will compare it with the catalog.', pl: 'Wyślij zdjęcie produktu, a porównam je z katalogiem.', de: 'Senden Sie ein Produktfoto, dann vergleiche ich es mit dem Katalog.',
    }),
    chat: localizedText(telegramUser.language, {
      uk: 'Поставте своє запитання.', en: 'Ask your question.', pl: 'Zadaj pytanie.', de: 'Stellen Sie Ihre Frage.',
    }),
    support: localizedText(telegramUser.language, {
      uk: 'Напишіть повідомлення для менеджера.', en: 'Write a message for the manager.', pl: 'Napisz wiadomość do menedżera.', de: 'Schreiben Sie eine Nachricht an den Mitarbeiter.',
    }),
  };
  await sendMessage(
    chatId,
    prompts[mode] || 'Напишіть свій запит.',
    mode === 'support' ? { reply_markup: supportEndMenu(telegramUser.language) } : {},
  );
  await recordMessage({
    userId: telegramUser.id,
    telegramChatId: chatId,
    direction: 'system',
    senderType: 'system',
    text: `mode:${mode}`,
    language: telegramUser.language,
  });
};

const handleCustomerPhoto = async (message, { showProgress = true } = {}) => {
  const chatId = message.chat.id;
  const user = await ensureTelegramUser(message.from);
  const largestPhoto = message.photo?.at(-1);
  if (!largestPhoto) return;

  await recordMessage({
    userId: user.id,
    telegramChatId: chatId,
    direction: 'inbound',
    senderType: 'customer',
    text: `[photo] ${message.caption || ''}`.trim(),
    language: user.language,
    telegramMessageId: message.message_id,
  });
  await sendChatAction(chatId, 'typing');
  if (showProgress) {
    await sendMessage(chatId, localizedText(user.language, {
      uk: '🔎 Порівнюю фото з каталогом…',
      en: '🔎 Comparing the photo with the catalog…',
      pl: '🔎 Porównuję zdjęcie z katalogiem…',
      de: '🔎 Ich vergleiche das Foto mit dem Katalog…',
    }));
  }

  let result;
  try {
    const queryImage = await downloadTelegramPhoto(largestPhoto.file_id);
    result = await searchByPhoto(queryImage);
  } catch {
    const reply = temporaryUnavailableText(user.language);
    await sendMessage(chatId, reply);
    await recordMessage({ userId: user.id, telegramChatId: chatId, direction: 'outbound', senderType: 'assistant', text: reply, language: user.language });
    return;
  }
  if (!result.products.length) {
    const noMatch = localizedText(user.language, {
      uk: 'Не знайшов достатньо схожої фігурки. Спробуйте фото крупнішим планом на нейтральному фоні або зверніться до менеджера.',
      en: 'I could not find a sufficiently similar figurine. Try a closer photo on a plain background or contact a manager.',
      pl: 'Nie znalazłem wystarczająco podobnej figurki. Spróbuj bliższego zdjęcia na jednolitym tle lub skontaktuj się z menedżerem.',
      de: 'Ich habe keine ausreichend ähnliche Figur gefunden. Versuchen Sie ein näheres Foto vor neutralem Hintergrund oder kontaktieren Sie einen Mitarbeiter.',
    });
    await sendMessage(chatId, noMatch);
    await recordMessage({ userId: user.id, telegramChatId: chatId, direction: 'outbound', senderType: 'assistant', text: noMatch, language: user.language });
    return;
  }

  const confident = result.confidence >= 0.75;
  const introduction = localizedText(user.language, confident ? {
    uk: '✅ Знайшов найімовірніший збіг. Нижче — ця фігурка та найближчі варіанти:',
    en: '✅ I found the most likely match. Here it is, followed by the closest alternatives:',
    pl: '✅ Znalazłem najbardziej prawdopodobne dopasowanie. Poniżej ono oraz najbliższe alternatywy:',
    de: '✅ Ich habe die wahrscheinlichste Übereinstimmung gefunden. Darunter folgen die nächsten Alternativen:',
  } : {
    uk: 'Схожість не дає стовідсоткової певності. Ось найближчі варіанти з каталогу:',
    en: 'The similarity is not conclusive. These are the closest catalog options:',
    pl: 'Podobieństwo nie daje pełnej pewności. Oto najbliższe opcje z katalogu:',
    de: 'Die Ähnlichkeit ist nicht eindeutig. Dies sind die ähnlichsten Katalogartikel:',
  });
  await sendMessage(chatId, introduction);
  await sendProductCards(chatId, result.products);
  await recordMessage({ userId: user.id, telegramChatId: chatId, direction: 'outbound', senderType: 'assistant', text: introduction, language: user.language });
  await recordPhotoSearchContext({
    userId: user.id,
    telegramChatId: chatId,
    language: user.language,
    candidateIds: result.products.map((product) => Number(product.product_id ?? product.id)),
    shownCount: Math.min(3, result.products.length),
  });
};

const handleCustomerMessage = async (message) => {
  const chatId = message.chat.id;
  const user = await ensureTelegramUser(message.from);
  const text = message.text?.trim();
  if (!text) {
    await sendMessage(chatId, localizedText(user.language, {
      uk: 'Наразі я обробляю текстові повідомлення та фотографії.', en: 'I currently handle text messages and photos.', pl: 'Obecnie obsługuję wiadomości tekstowe i zdjęcia.', de: 'Derzeit verarbeite ich Textnachrichten und Fotos.',
    }));
    return;
  }
  if (text === '/start' || text === '/menu' || text === '/help') {
    if (text === '/start') {
      await sendMessage(chatId, languageWelcomeText, { reply_markup: languageMenu });
    } else {
      await sendMessage(chatId, capabilitiesText(user.language), { reply_markup: languageMenu });
    }
    return;
  }

  const mode = await getUserMode(user.id);
  await recordMessage({
    userId: user.id,
    telegramChatId: chatId,
    direction: 'inbound',
    senderType: 'customer',
    text,
    language: user.language,
    telegramMessageId: message.message_id,
  });

  if (mode !== 'support' && isSupportRequest(text)) {
    await recordMessage({
      userId: user.id,
      telegramChatId: chatId,
      direction: 'system',
      senderType: 'system',
      text: 'mode:support',
      language: user.language,
    });
    await sendMessage(chatId, localizedText(user.language, {
      uk: 'Добре. Напишіть повідомлення для менеджера — наступні повідомлення підуть безпосередньо йому.',
      en: 'Sure. Write your message for the manager — your next messages will go directly to them.',
      pl: 'Dobrze. Napisz wiadomość do menedżera — kolejne wiadomości trafią bezpośrednio do niego.',
      de: 'Gerne. Schreiben Sie Ihre Nachricht — die nächsten Nachrichten gehen direkt an den Mitarbeiter.',
    }), { reply_markup: supportEndMenu(user.language) });
    return;
  }

  if (mode === 'support') {
    let request = await findOpenSupportRequest(user.id, chatId);
    const isNewRequest = !request;
    if (!request) {
      request = await createSupportRequest({ userId: user.id, telegramChatId: chatId, message: text });
    }
    const managerText = user.language === config.bot.defaultLanguage
      ? text
      : await translate({ text, targetLanguage: config.bot.defaultLanguage });
    for (const adminId of config.telegram.adminIds) {
      const notification = await sendMessage(adminId,
        `<b>${isNewRequest ? 'Нове звернення' : 'Нове повідомлення у зверненні'} #${request.id}</b>\nКлієнт: ${escapeHtml(user.display_name || user.telegram_username || user.telegram_user_id)}\nМова: ${escapeHtml(user.language)}\n\n${escapeHtml(managerText)}\n\nВідповідайте через Reply на це повідомлення.`,
        { reply_markup: managerCloseMenu(request.id) });
      await attachAdminNotification(request.id, adminId, notification.message_id);
    }
    await sendMessage(chatId, localizedText(user.language, {
      uk: '✅ Повідомлення передано менеджеру. Можете продовжувати писати в цьому чаті.',
      en: '✅ Message sent to the manager. You can continue writing in this chat.',
      pl: '✅ Wiadomość została wysłana do menedżera. Możesz kontynuować rozmowę tutaj.',
      de: '✅ Nachricht an den Mitarbeiter gesendet. Sie können hier weiterschreiben.',
    }), { reply_markup: supportEndMenu(user.language) });
    return;
  }

  if (isMenuRequest(text)) {
    await sendMessage(chatId, capabilitiesText(user.language), { reply_markup: languageMenu });
    return;
  }

  if (isCatalogCountRequest(text)) {
    const count = await catalog.getCatalogCount();
    const reply = localizedText(user.language, {
      uk: `У демонстраційному каталозі ${count} товарних позицій.`,
      en: `The demonstration catalog contains ${count} products.`,
      pl: `Katalog demonstracyjny zawiera ${count} produktów.`,
      de: `Der Demonstrationskatalog enthält ${count} Produkte.`,
    });
    await sendMessage(chatId, reply);
    await recordMessage({ userId: user.id, telegramChatId: chatId, direction: 'outbound', senderType: 'assistant', text: reply, language: user.language });
    return;
  }

  if (isPhoneRequest(text)) {
    const reply = localizedText(user.language, {
      uk: 'У цьому прототипі контакти не опубліковані. Можу підключити менеджера.',
      en: 'Contact details are not published in this prototype. I can connect you with a manager.',
      pl: 'Dane kontaktowe nie są opublikowane w tym prototypie. Mogę połączyć z menedżerem.',
      de: 'Kontaktdaten sind in diesem Prototyp nicht veröffentlicht. Ich kann Sie mit einem Mitarbeiter verbinden.',
    });
    await sendMessage(chatId, escapeHtml(reply));
    await recordMessage({ userId: user.id, telegramChatId: chatId, direction: 'outbound', senderType: 'assistant', text: reply, language: user.language });
    return;
  }

  if (isWebsiteRequest(text)) {
    const reply = localizedText(user.language, {
      uk: 'Це навчальний каталоговий бот без окремого сайту.',
      en: 'This is a demonstration catalog bot without a separate website.',
      pl: 'To demonstracyjny bot katalogowy bez osobnej strony.',
      de: 'Dies ist ein Demo-Katalogbot ohne eigene Website.',
    });
    await sendMessage(chatId, escapeHtml(reply));
    await recordMessage({ userId: user.id, telegramChatId: chatId, direction: 'outbound', senderType: 'assistant', text: reply, language: user.language });
    return;
  }

  if (isPriceRequest(text)) {
    const reply = localizedText(user.language, {
      uk: 'У каталозі немає підтверджених цін, тому я не можу визначити найдорожчий або найдешевший виріб. Точну ціну повідомить менеджер.',
      en: 'The catalog has no confirmed prices, so I cannot identify the most or least expensive item. A manager can provide the exact price.',
      pl: 'Katalog nie zawiera potwierdzonych cen, więc nie mogę wskazać najdroższego ani najtańszego produktu. Dokładną cenę poda menedżer.',
      de: 'Im Katalog sind keine bestätigten Preise hinterlegt. Daher kann ich den teuersten oder günstigsten Artikel nicht bestimmen. Den genauen Preis nennt ein Mitarbeiter.',
    });
    await sendMessage(chatId, escapeHtml(reply), { reply_markup: supportStartMenu(user.language) });
    await recordMessage({ userId: user.id, telegramChatId: chatId, direction: 'outbound', senderType: 'assistant', text: reply, language: user.language });
    return;
  }

  const photoFollowUp = isPhotoAlternativeRequest(text) || isVisualRefinementRequest(text);
  const photoContext = photoFollowUp ? await getRecentPhotoSearchContext(user.id) : null;
  if (photoContext && isPhotoAlternativeRequest(text)) {
    const candidateIds = Array.isArray(photoContext.candidateIds) ? photoContext.candidateIds.map(Number) : [];
    const shownCount = Number(photoContext.shownCount) || 0;
    const nextIds = candidateIds.slice(shownCount, shownCount + 3);
    if (nextIds.length) {
      const alternatives = await catalog.findByIds(nextIds);
      const reply = localizedText(user.language, {
        uk: 'Ось наступні найближчі варіанти з цього пошуку:',
        en: 'Here are the next closest options from this search:',
        pl: 'Oto kolejne najbliższe opcje z tego wyszukiwania:',
        de: 'Hier sind die nächsten ähnlichen Optionen aus dieser Suche:',
      });
      await sendMessage(chatId, reply);
      await sendProductCards(chatId, alternatives);
      await recordMessage({ userId: user.id, telegramChatId: chatId, direction: 'outbound', senderType: 'assistant', text: reply, language: user.language });
      await recordPhotoSearchContext({
        userId: user.id,
        telegramChatId: chatId,
        language: user.language,
        candidateIds,
        shownCount: shownCount + nextIds.length,
      });
    } else {
      const reply = localizedText(user.language, {
        uk: 'Я вже показав усі найближчі результати цього фотопошуку. Опишіть відмінність — наприклад, колір, позу, форму або деталь — і я виконаю новий пошук у всьому каталозі.',
        en: 'I have shown all the closest results from this photo search. Describe a difference such as color, pose, shape, or a detail, and I will search the full catalog again.',
        pl: 'Pokazałem już wszystkie najbliższe wyniki tego wyszukiwania. Opisz różnicę, np. kolor, pozę, kształt lub detal, a ponownie przeszukam cały katalog.',
        de: 'Ich habe alle nächsten Ergebnisse dieser Fotosuche gezeigt. Beschreiben Sie einen Unterschied wie Farbe, Haltung, Form oder Detail, dann durchsuche ich den gesamten Katalog erneut.',
      });
      await sendMessage(chatId, reply);
      await recordMessage({ userId: user.id, telegramChatId: chatId, direction: 'outbound', senderType: 'assistant', text: reply, language: user.language });
    }
    return;
  }

  const history = await getRecentHistory(user.id);
  const directProductCode = extractProductCode(text);
  const productCode = directProductCode || (isPhotoRequest(text) ? extractRecentProductCode(history) : null);
  const exactProduct = productCode ? await catalog.findByExactName(productCode) : null;

  if (productCode && isPhotoRequest(text)) {
    const reply = exactProduct
      ? localizedText(user.language, {
        uk: `Ось фото ${exactProduct.name}:`,
        en: `Here is the photo of ${exactProduct.name}:`,
        pl: `Oto zdjęcie ${exactProduct.name}:`,
        de: `Hier ist das Foto von ${exactProduct.name}:`,
      })
      : localizedText(user.language, {
        uk: `Не знайшов товар ${productCode}. Перевірте, будь ласка, технічну назву.`,
        en: `I could not find ${productCode}. Please check the technical name.`,
        pl: `Nie znalazłem produktu ${productCode}. Sprawdź nazwę techniczną.`,
        de: `Ich konnte ${productCode} nicht finden. Bitte prüfen Sie die technische Bezeichnung.`,
      });
    await sendMessage(chatId, escapeHtml(reply));
    if (exactProduct) await sendProductCards(chatId, [exactProduct]);
    await recordMessage({
      userId: user.id,
      telegramChatId: chatId,
      direction: 'outbound',
      senderType: 'assistant',
      text: reply,
      language: user.language,
    });
    return;
  }

  const wantsCatalog = shouldSearchCatalog(text, mode, history);
  let products = exactProduct ? [exactProduct] : [];
  if (!exactProduct && wantsCatalog) {
    try {
      products = await recommend(buildCatalogQuery(text, history), {
        excludeIds: photoContext?.candidateIds || [],
      });
    } catch {
      const reply = temporaryUnavailableText(user.language);
      await sendMessage(chatId, reply);
      await recordMessage({ userId: user.id, telegramChatId: chatId, direction: 'outbound', senderType: 'assistant', text: reply, language: user.language });
      return;
    }
  }
  const names = products.map((product) => product.name).join(', ');
  let reply;
  if (exactProduct) {
    reply = localizedText(user.language, {
      uk: `Знайшов ${exactProduct.name}.`,
      en: `I found ${exactProduct.name}.`,
      pl: `Znalazłem ${exactProduct.name}.`,
      de: `Ich habe ${exactProduct.name} gefunden.`,
    });
  } else if (wantsCatalog && products.length) {
    reply = localizedText(user.language, {
      uk: `Ось найближчі відповідні варіанти: ${names}.`,
      en: `Here are the closest matching options: ${names}.`,
      pl: `Oto najlepiej pasujące opcje: ${names}.`,
      de: `Hier sind die am besten passenden Optionen: ${names}.`,
    });
  } else if (wantsCatalog) {
    reply = localizedText(user.language, {
      uk: 'Точного збігу за цим описом поки не знайшов. Спробуйте назвати предмет, колір, форму або стиль іншими словами.',
      en: 'I could not find a sufficiently accurate visual match. Please specify the figurine type, color, or size.',
      pl: 'Nie znalazłem wystarczająco dokładnego dopasowania wizualnego. Podaj rodzaj figurki, kolor lub rozmiar.',
      de: 'Ich habe keine ausreichend genaue visuelle Übereinstimmung gefunden. Bitte nennen Sie Figurentyp, Farbe oder Größe.',
    });
  } else {
    try {
      reply = await writeReply({ language: user.language, message: text, history: isGreeting(text) ? '' : history });
    } catch {
      reply = temporaryUnavailableText(user.language);
    }
  }
  await sendMessage(chatId, escapeHtml(reply));
  if (wantsCatalog && products.length) await sendProductCards(chatId, products);
  await recordMessage({
    userId: user.id,
    telegramChatId: chatId,
    direction: 'outbound',
    senderType: 'assistant',
    text: reply,
    language: user.language,
  });
  if (mode === 'search') {
    await recordMessage({
      userId: user.id,
      telegramChatId: chatId,
      direction: 'system',
      senderType: 'system',
      text: 'mode:chat',
      language: user.language,
    });
  }
};

export const handleUpdate = async (update, { attempt = 1 } = {}) => {
  if (update.callback_query) return handleCallback(update.callback_query);
  if (!update.message) return;
  if (await handleAdminReply(update.message)) return;
  if (update.message.photo?.length) return handleCustomerPhoto(update.message, { showProgress: attempt === 1 });
  return handleCustomerMessage(update.message);
};
