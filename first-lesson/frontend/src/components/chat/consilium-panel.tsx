'use client';

import { X, Plus } from 'lucide-react';
import { ConsiliumParams, Role } from '@/types/ai-params';

interface ConsiliumPanelProps {
  consilium: ConsiliumParams;
  roles: Role[];
  toggleConsilium: () => void;
  setExpert: (index: number, field: 'name' | 'systemPrompt' | 'mode' | 'roleId', value: string) => void;
  setExpertRole: (index: number, roleId: string, roleName: string) => void;
  addExpert: () => void;
  removeExpert: (index: number) => void;
}

export function ConsiliumPanel({
  consilium,
  roles,
  toggleConsilium,
  setExpert,
  setExpertRole,
  addExpert,
  removeExpert,
}: ConsiliumPanelProps) {
  const isExpertFilled = (e: ConsiliumParams['experts'][number]) =>
    (e.mode === 'role' && !!e.roleId) || (e.mode === 'custom' && e.systemPrompt.trim().length > 0);

  const filledCount = consilium.experts.filter(isExpertFilled).length;

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-medium text-gray-700">Режим Консилиум</label>
          <p className="text-[10px] text-gray-400">
            Несколько экспертов отвечают параллельно, затем синтез.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleConsilium}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            consilium.enabled ? 'bg-indigo-600' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={consilium.enabled}
          aria-label="Включить режим Консилиум"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              consilium.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Experts */}
      {consilium.enabled && (
        <div className="space-y-3">
          {consilium.experts.map((expert, index) => (
            <div
              key={index}
              className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50"
            >
              {/* Header with remove button */}
              <div className="flex items-center justify-between">
                {expert.mode === 'custom' ? (
                  <input
                    type="text"
                    value={expert.name}
                    onChange={(e) => setExpert(index, 'name', e.target.value)}
                    className="text-xs font-medium text-gray-700 bg-transparent border-none outline-none focus:ring-0 p-0 w-full"
                    placeholder="Имя эксперта"
                    maxLength={30}
                  />
                ) : (
                  <span className="text-xs font-medium text-gray-700 truncate">
                    {expert.name}
                  </span>
                )}
                {consilium.experts.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeExpert(index)}
                    className="p-0.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    aria-label={`Удалить ${expert.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Mode tabs */}
              {roles.length > 0 && (
                <div className="flex rounded-md overflow-hidden border border-gray-300 w-fit">
                  <button
                    type="button"
                    onClick={() => setExpert(index, 'mode', 'role')}
                    className={`px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                      expert.mode === 'role'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    Роль
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpert(index, 'mode', 'custom')}
                    className={`px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                      expert.mode === 'custom'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    Свой промпт
                  </button>
                </div>
              )}

              {/* Role mode */}
              {expert.mode === 'role' && roles.length > 0 && (
                <select
                  value={expert.roleId || ''}
                  onChange={(e) => {
                    const selectedRole = roles.find((r) => r.id === e.target.value);
                    if (selectedRole) {
                      setExpertRole(index, selectedRole.id, selectedRole.name);
                    } else {
                      setExpert(index, 'roleId', '');
                    }
                  }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Выберите роль...</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Custom mode */}
              {expert.mode === 'custom' && (
                <>
                  <textarea
                    value={expert.systemPrompt}
                    onChange={(e) => setExpert(index, 'systemPrompt', e.target.value)}
                    rows={2}
                    maxLength={2000}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Системный промпт эксперта..."
                  />
                  <div className="text-right text-[10px] text-gray-400">
                    {expert.systemPrompt.length}/2000
                  </div>
                </>
              )}
            </div>
          ))}

          {consilium.experts.length < 3 && (
            <button
              type="button"
              onClick={addExpert}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить эксперта
            </button>
          )}

          {filledCount < 2 && (
            <p className="text-[10px] text-amber-600">
              Заполните роль или системный промпт минимум у 2 экспертов для работы консилиума.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
