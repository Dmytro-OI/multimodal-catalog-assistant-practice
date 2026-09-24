const productCodePattern = /\b[\p{L}\d]{1,16}(?:[-_][\p{L}\d]{1,16})+\b/giu;

const catalogIntentPattern = /(порад\p{L}*|порекоменду\p{L}*|підбер\p{L}*|знайд\p{L}*|покаж\p{L}*|фігур\p{L}*|товар\p{L}*|виріб|вироби|подар\p{L}*|recommend\p{L}*|suggest\p{L}*|find\p{L}*|show\p{L}*|figur\p{L}*|product\p{L}*|gift\p{L}*|pole\p{L}*|znajd\p{L}*|pokaż\p{L}*|produkt\p{L}*|prezent\p{L}*|empfehl\p{L}*|such\p{L}*|zeig\p{L}*|geschenk\p{L}*)/iu;

const photoIntentPattern = /(фото\p{L}*|фотк\p{L}*|зображенн\p{L}*|покаж\p{L}*|скинь\p{L}*|надішл\p{L}*|вигляда\p{L}*|photo\p{L}*|picture\p{L}*|image\p{L}*|show\p{L}*|send\p{L}*|look\p{L}*|zdję\p{L}*|fot\p{L}*|pokaż\p{L}*|wyślij\p{L}*|bild\p{L}*|foto\p{L}*|zeig\p{L}*|schick\p{L}*|aussieh\p{L}*)/iu;
const recentProductReferencePattern = /((?<![\p{L}\d_])(?:цей|ця|це|ці|цього|цієї|цю|його|її|того|тієї|this|that|it|its|previous|last|same|jego|jej|sein|ihr)(?![\p{L}\d_])|попередн\p{L}*|останн\p{L}*|poprzedn\p{L}*|dies\p{L}*|vorherig\p{L}*)/iu;
const barePhotoRequestPattern = /^\s*(?:(?:покаж\p{L}*|скинь\p{L}*|надішл\p{L}*|show|send|pokaż\p{L}*|wyślij\p{L}*|zeig\p{L}*|schick\p{L}*)\s+(?:мені|me|mi|mir)?\s*)?(?:the\s+|a\s+)?(?:фото\p{L}*|фотк\p{L}*|зображенн\p{L}*|photo\p{L}*|picture\p{L}*|image\p{L}*|zdję\p{L}*|fot\p{L}*|bild\p{L}*)\s*[?!.,]*$/iu;

const supportIntentPattern = /(зв['’]?яж\p{L}*|з'єдн\p{L}*|менеджер\p{L}*|оператор\p{L}*|жив\p{L}*\s+людин\p{L}*|contact\p{L}*\s+(a\s+)?(manager|person|human)|speak\p{L}*\s+(to|with)\s+(a\s+)?(manager|person|human)|manager\p{L}*|konsultant\p{L}*|pracownik\p{L}*|mitarbeiter\p{L}*|berater\p{L}*)/iu;

const websiteIntentPattern = /(який\s+сайт|сайт\s+який|адрес\p{L}*\s+сайт\p{L}*|посиланн\p{L}*\s+на\s+сайт|website|web\s*site|stron\p{L}*\s+internet\p{L}*|webseite)/iu;
const phoneIntentPattern = /(номер\p{L}*\s+телефон\p{L}*|телефон\p{L}*\s+номер\p{L}*|дай\p{L}*\s+номер|phone\s+number|numer\p{L}*\s+telefon\p{L}*|telefonnummer)/iu;
const priceIntentPattern = /(найдорож\p{L}*|найдешев\p{L}*|скільки\s+кошту\p{L}*|цін\p{L}*|price\p{L}*|most\s+expensive|cheapest|cen\p{L}*|teuer\p{L}*|preis\p{L}*)/iu;
const smallTalkPattern = /^(привіт\p{L}*|вітаю|дякую|спасибі|бувай|як\s+справи\??|так|та|ні|ок(?:ей)?|давай|hello|hi|thanks|thank\s+you|bye|how\s+are\s+you\??|yes|no|sure)$/iu;
const availabilityIntentPattern = /^(?:а\s+)?(?:(?:є|маєте|наявн\p{L}*)\s+[\p{L}\d'’_-]+(?:\s+[\p{L}\d'’_-]+){0,5}|[\p{L}\d'’_-]+(?:\s+[\p{L}\d'’_-]+){0,4}\s+є|(?:do\s+you|u)\s+have\s+.+|(?:have|got)\s+(?:anything|something)\s+like\s+.+|any\s+.+)\??$/iu;
const conversationalCatalogPattern = /(?:^|[,!?]\s*)(?:а\s+)?(?:чи\s+)?(?:у\s+вас\s+)?(?:є|маєте)\s+(?:у\s+вас\s+)?(?:щось|що-небудь|якісь?)\s+(?:з|із|зі|на\s+кшталт)\s+\p{L}+/iu;
const giftRecipientPattern = /(?:що|шо|щось|який|яку|порад\p{L}*|підбер\p{L}*).{0,60}\sдля\s+[\p{L}\d'’_-]+/iu;
const preferencePattern = /(люб\p{L}*|подоба\p{L}*|захоплю\p{L}*|цікавить\p{L}*|хобі|likes?|enjoys?|hobb(?:y|ies)|interested\s+in|lubi\p{L}*|interesuje\p{L}*|mag\p{L}*|interessiert\p{L}*)/iu;
const colorPreferencePattern = /(колір|кольор\p{L}*|color|colour|kolor|farbe)/iu;
const affirmativePattern = /^(?:так|та|давай|добре|гаразд|ок(?:ей)?|авжеж|yes|sure|okay|ok|tak|dobrze|ja|gern)\s*[.!]?$/iu;
const catalogOfferPattern = /assistant:.*(?:переглянути|подивитися|показати|варіанти|товари|вироби|сувеніри|would\s+you\s+like\s+to\s+(?:see|view)|show\s+you|produkty|wyroby|zobaczyć|produkte|artikel|möchten\s+sie)/iu;
const photoAlternativePattern = /(ще|інші|инші|другі|наступні|more|other|next|inne|kolejne|weitere|andere)\s+(варіант\p{L}*|фігур\p{L}*|товар\p{L}*|option\p{L}*|product\p{L}*|figur\p{L}*|wariant\p{L}*|produkt\p{L}*|option\p{L}*|artikel\p{L}*)/iu;
const visualRefinementPattern = /(довш\p{L}*|коротш\p{L}*|вищ\p{L}*|нижч\p{L}*|більш\p{L}*|менш\p{L}*|інш\p{L}*\s+(?:колір|форм|поз|детал)|ног\p{L}*|хвіст\p{L}*|крил\p{L}*|longer|shorter|taller|smaller|different\s+(?:color|shape|pose)|legs?|tail|wings?|dłuższ\p{L}*|krótsz\p{L}*|beine|länger|kürzer)/iu;
const menuIntentPattern = /^(?:яке\s+меню|покажи\p{L}*\s+меню|меню\s+покаж\p{L}*|(?:що|шо)\s+ти\s+(?:вмієш|можеш)(?:\s+робити)?|(?:хто|хо)\s+ти|можливост\p{L}*|help|menu)\s*[?!.,]*$/iu;
const catalogCountIntentPattern = /(скільки\p{L}*\s+(всього\s+)?(є\s+)?(вид\p{L}*|товар\p{L}*|позиці\p{L}*)|кількість\p{L}*\s+(товар\p{L}*|позиці\p{L}*)|how\s+many\s+(products|items))/iu;
const catalogContextPattern = /(товар\p{L}*|фігур\p{L}*|виріб|вироби|каталог\p{L}*|product\p{L}*|figur\p{L}*|catalog\p{L}*)/iu;
const shortSubjectPattern = /^(?:а\s+)?[\p{L}'’_-]+(?:\s+[\p{L}'’_-]+){0,2}\??$/iu;
const catalogDetailPattern = /(квіт\p{L}*|тварин\p{L}*|птах\p{L}*|риб\p{L}*|сувенір\p{L}*|декор\p{L}*|син\p{L}*|блакит\p{L}*|червон\p{L}*|зелен\p{L}*|жовт\p{L}*|чорн\p{L}*|біл\p{L}*|темн\p{L}*|світл\p{L}*|велик\p{L}*|мал\p{L}*|міні\p{L}*|flower\p{L}*|animal\p{L}*|bird\p{L}*|fish\p{L}*|souvenir\p{L}*|decor\p{L}*|blue|red|green|yellow|black|white|dark|light|large|small|mini)/iu;
const contextualReferencePattern = /(цей|ця|це|цієї|цього|так\p{L}*|попередн\p{L}*|this|that|previous|same)/iu;
const topicResetPattern = /(мене\s+тепер\s+цікав|тепер\s+(?:хочу|шукаю|цікав)|змінимо\s+тему|інш\p{L}*\s+(?:товар|тема)|замість\s+цього|now\s+i\s+(?:want|need|am\s+looking)|change\s+the\s+topic|something\s+different|instead\s+of)/iu;
const greetingPattern = /^(привіт\p{L}*|вітаю|добрий\s+(?:день|вечір|ранок)|hello|hi|hey|dzień\s+dobry|cześć|hallo|guten\s+(?:tag|morgen|abend))[!,.?\s]*$/iu;

export const extractProductCode = (text = '') => {
  const matches = String(text).match(productCodePattern) || [];
  return matches.find((value) => /\d/.test(value)) || null;
};

export const extractRecentProductCode = (history = '') => {
  const assistantMessages = String(history)
    .split('\n')
    .filter((line) => line.startsWith('assistant: '))
    .reverse();
  for (const message of assistantMessages) {
    const matches = message.match(productCodePattern) || [];
    const code = [...matches].reverse().find((value) => /\d/.test(value));
    if (code) return code;
  }
  return null;
};

export const isPhotoRequest = (text = '') => photoIntentPattern.test(String(text));

export const isRecentProductPhotoRequest = (text = '') => {
  const value = String(text).trim();
  return isPhotoRequest(value)
    && (recentProductReferencePattern.test(value) || barePhotoRequestPattern.test(value));
};

export const isSupportRequest = (text = '') => supportIntentPattern.test(String(text));

export const isWebsiteRequest = (text = '') => websiteIntentPattern.test(String(text));

export const isPhoneRequest = (text = '') => phoneIntentPattern.test(String(text));

export const isPriceRequest = (text = '') => priceIntentPattern.test(String(text));

export const isMenuRequest = (text = '') => menuIntentPattern.test(String(text));

export const isCatalogCountRequest = (text = '') => catalogCountIntentPattern.test(String(text));

export const isPhotoAlternativeRequest = (text = '') => photoAlternativePattern.test(String(text));

export const isVisualRefinementRequest = (text = '') => visualRefinementPattern.test(String(text));

export const isGreeting = (text = '') => greetingPattern.test(String(text).trim());

export const normalizeCatalogQuery = (text = '') => {
  const original = String(text).trim().replace(/[?!.,]+$/u, '').trim();
  const normalized = original
    .replace(/^(?:прикольно|круто|добре|гаразд|ок(?:ей)?)\s*[,!.]?\s*/iu, '')
    .replace(/^(?:а\s+)?(?:чи\s+)?(?:у\s+вас\s+)?(?:є|маєте)\s+(?:у\s+вас\s+)?(?:щось|що-небудь|якісь?)?\s*(?:з|із|зі|на\s+кшталт)?\s*/iu, '')
    .replace(/^(?:порад\p{L}*|підбер\p{L}*|порекоменду\p{L}*|покаж\p{L}*|знайд\p{L}*)\s*[,!.-]?\s*(?:будь\s+ласка\s*[,!.-]?\s*)?/iu, '')
    .replace(/^(?:я\s+)?(?:хочу|хотів(?:ла)?(?:\s+би)?|шукаю|потрібн\p{L}*)\s*/iu, '')
    .replace(/^(?:мене\s+)?(?:тепер\s+)?(?:цікавить|цікавлять)\s*/iu, '')
    .replace(/^(?:do\s+you\s+have|have\s+you\s+got|show|recommend|suggest|find)\s+(?:anything\s+|something\s+|any\s+)?(?:with|like)?\s*/iu, '')
    .replace(/^(?:а|але)\s+/iu, '')
    .replace(/\s+є$/iu, '')
    .trim();
  return normalized.length >= 2 ? normalized : original;
};

const recentCustomerMessages = (history = '') => {
  const messages = String(history)
    .split('\n')
    .filter((line) => line.startsWith('customer: '))
    .map((line) => line.slice('customer: '.length).trim())
    .filter(Boolean);
  const resetIndex = messages.findLastIndex((message) => topicResetPattern.test(message));
  return resetIndex < 0 ? messages : messages.slice(resetIndex);
};

export const buildCatalogQuery = (text = '', history = '') => {
  const current = normalizeCatalogQuery(text);
  const raw = String(text).trim();
  if (topicResetPattern.test(raw)) return current;
  const needsContext = preferencePattern.test(raw)
    || colorPreferencePattern.test(raw)
    || affirmativePattern.test(raw)
    || contextualReferencePattern.test(raw)
    || visualRefinementPattern.test(raw);
  if (!needsContext) return current;

  const prior = recentCustomerMessages(history)
    .filter((message) => message !== raw)
    .filter((message) => !smallTalkPattern.test(message))
    .filter((message) => !(photoIntentPattern.test(message) && contextualReferencePattern.test(message)))
    .filter((message) => catalogDetailPattern.test(message)
      || preferencePattern.test(message)
      || catalogIntentPattern.test(message)
      || giftRecipientPattern.test(message))
    .slice(-4)
    .map(normalizeCatalogQuery);
  const parts = affirmativePattern.test(raw) ? prior : [...prior.slice(-3), current];
  return [...new Set(parts)].join(' ').trim() || current;
};

export const shouldSearchCatalog = (text = '', mode = 'chat', recentContext = '') => (
  mode === 'search'
  || Boolean(extractProductCode(text))
  || catalogIntentPattern.test(String(text))
  || conversationalCatalogPattern.test(String(text).trim())
  || giftRecipientPattern.test(String(text))
  || preferencePattern.test(String(text))
  || visualRefinementPattern.test(String(text))
  || (availabilityIntentPattern.test(String(text).trim()) && !smallTalkPattern.test(String(text).trim()))
  || (affirmativePattern.test(String(text).trim()) && catalogOfferPattern.test(String(recentContext)))
  || (catalogContextPattern.test(String(recentContext)) && shortSubjectPattern.test(String(text).trim()) && !smallTalkPattern.test(String(text).trim()))
);
