interface EmptyStateProps {
  onStartTestDialog?: () => void;
  isTestDialogAvailable?: boolean;
}

export function EmptyState({ onStartTestDialog, isTestDialogAvailable = false }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Создайте проект, чтобы начать диалог</h2>
      <p className="text-sm text-gray-500 max-w-xs">
        Создайте проект в боковой панели, затем начните новый диалог
      </p>
      {isTestDialogAvailable && onStartTestDialog && (
        <button
          type="button"
          onClick={onStartTestDialog}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Запустить тестовый диалог
        </button>
      )}
      {isTestDialogAvailable && (
        <p className="mt-2 max-w-sm text-xs text-gray-400">
          Кнопка отправит 10 фиксированных сообщений через текущие параметры диалога.
        </p>
      )}
    </div>
  );
}
