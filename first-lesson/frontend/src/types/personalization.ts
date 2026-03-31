export type ResponseLanguage = 'auto' | 'ru' | 'en';
export type DialogueStyle = 'formal' | 'friendly' | 'technical' | 'creative';
export type ResponseBrevity = 'brief' | 'detailed' | 'unset';

export interface UserProfile {
  responseLanguage: ResponseLanguage;
  dialogueStyle: DialogueStyle;
  responseBrevity: ResponseBrevity;
  customPrompt: string;
  preferences: Record<string, unknown>;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  responseLanguage: 'auto',
  dialogueStyle: 'friendly',
  responseBrevity: 'unset',
  customPrompt: '',
  preferences: {},
};

export const LANGUAGE_LABELS: Record<ResponseLanguage, string> = {
  auto: 'Авто',
  ru: 'Русский',
  en: 'English',
};

export const STYLE_LABELS: Record<DialogueStyle, string> = {
  formal: 'Формальный',
  friendly: 'Дружелюбный',
  technical: 'Технический',
  creative: 'Творческий',
};

export const BREVITY_LABELS: Record<ResponseBrevity, string> = {
  brief: 'Кратко',
  detailed: 'Подробно',
  unset: 'По умолчанию',
};
