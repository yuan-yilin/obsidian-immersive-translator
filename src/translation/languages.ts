export const LANGUAGE_NAMES: Record<string, string> = {
  auto: "自动检测",
  zh: "中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  pt: "Português",
  ru: "Русский",
  ar: "العربية",
  it: "Italiano",
  th: "ไทย",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
};

export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export function getPromptLanguageName(code: string): string {
  return code === "auto" ? "auto-detected language" : getLanguageName(code);
}
