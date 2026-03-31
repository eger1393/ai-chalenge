'use client';

import { Loader2 } from 'lucide-react';
import {
  UserProfile,
  ResponseLanguage,
  DialogueStyle,
  ResponseBrevity,
  LANGUAGE_LABELS,
  STYLE_LABELS,
  BREVITY_LABELS,
} from '@/types/personalization';

interface PersonalizationPanelProps {
  profile: UserProfile;
  onUpdateField: <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => void;
  isSaving: boolean;
}

const LANGUAGES: ResponseLanguage[] = ['auto', 'ru', 'en'];
const STYLES: DialogueStyle[] = ['formal', 'friendly', 'technical', 'creative'];
const BREVITIES: ResponseBrevity[] = ['brief', 'detailed', 'unset'];

export function PersonalizationPanel({ profile, onUpdateField, isSaving }: PersonalizationPanelProps) {
  return (
    <div className="px-4 py-4 space-y-4">
      {/* Language */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1.5 block">Язык ответа</label>
        <div className="border border-gray-300 rounded-lg overflow-hidden flex">
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => onUpdateField('responseLanguage', lang)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                profile.responseLanguage === lang
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
      </div>

      {/* Style */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1.5 block">Стиль диалога</label>
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => onUpdateField('dialogueStyle', style)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                profile.dialogueStyle === style
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {STYLE_LABELS[style]}
            </button>
          ))}
        </div>
      </div>

      {/* Brevity */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1.5 block">Краткость</label>
        <div className="border border-gray-300 rounded-lg overflow-hidden flex">
          {BREVITIES.map((brevity) => (
            <button
              key={brevity}
              type="button"
              onClick={() => onUpdateField('responseBrevity', brevity)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                profile.responseBrevity === brevity
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {BREVITY_LABELS[brevity]}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Prompt */}
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700">Дополнительные инструкции</label>
          <span className="text-[10px] text-gray-400">
            {profile.customPrompt.length}/2000
          </span>
        </div>
        <textarea
          value={profile.customPrompt}
          maxLength={2000}
          onChange={(e) => onUpdateField('customPrompt', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="Любые дополнительные инструкции для ИИ, применяемые ко всем диалогам..."
        />
        {isSaving && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Сохранение...
          </div>
        )}
      </div>
    </div>
  );
}
