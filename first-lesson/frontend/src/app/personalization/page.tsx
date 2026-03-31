'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Brain } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { usePersonalization } from '@/hooks/use-personalization';
import { PersonalizationPanel } from '@/components/chat/personalization-panel';

export default function PersonalizationPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const { profile, isLoading: profileLoading, isSaving, updateField } = usePersonalization();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3">
        <button
          onClick={() => router.push('/chat')}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="Вернуться в чат"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
            <Brain size={14} className="text-purple-600" />
          </div>
          <span className="font-semibold text-gray-900">Персонализация</span>
        </div>
        <div className="ml-auto text-xs text-gray-400">{user?.username}</div>
      </header>

      {/* Content */}
      <main className="max-w-xl mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Настройки долговременной памяти</h1>
          <p className="text-sm text-gray-500 mt-1">
            Применяются ко всем диалогам. ИИ будет учитывать эти настройки при каждом ответе.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {profileLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          ) : (
            <PersonalizationPanel
              profile={profile}
              onUpdateField={updateField}
              isSaving={isSaving}
            />
          )}
        </div>

        {isSaving && (
          <p className="text-xs text-gray-400 text-center mt-3">Сохранение...</p>
        )}
      </main>
    </div>
  );
}
