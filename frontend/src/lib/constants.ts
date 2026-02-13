export const LANGUAGES = [
  { code: "fr", label: "Fran\u00e7ais" },
  { code: "en", label: "English" },
  { code: "es", label: "Espa\u00f1ol" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Portugu\u00eas" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "ru", label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439" },
  { code: "zh", label: "\u4e2d\u6587" },
  { code: "ja", label: "\u65e5\u672c\u8a9e" },
  { code: "ko", label: "\ud55c\uad6d\uc5b4" },
  { code: "ar", label: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" },
] as const;

export const DEFAULT_LANGUAGE = "fr";

export const BACKEND_URL = "http://localhost:8001";
export const WS_URL = "ws://localhost:8001";
