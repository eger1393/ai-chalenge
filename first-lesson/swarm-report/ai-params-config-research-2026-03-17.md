# Research: Конфигурируемые параметры AI запросов

Дата: 2026-03-17

## Задача
Добавить на фронте панель конфигурации параметров AI запросов (temperature, max_tokens, stop sequences, system prompt). Параметры применяются к каждому сообщению. Перед ответом нейронки отображать примененные параметры в кратком техническом виде.

## Консилиум — сводка

### Архитектор
- Параметры как вложенный `params` объект в MessageDto (не отдельный эндпоинт)
- React Context + localStorage для хранения на фронте
- `appliedParams` прикрепляется к каждому Message объекту
- System prompt НЕ хранится в conversationHistory
- Backend валидирует и clamp-ит все значения

### Frontend-эксперт
- Коллапсируемая панель над полем ввода (gear icon toggle) ✅ ВЫБРАНО ПОЛЬЗОВАТЕЛЕМ
- `useAIParams` hook + localStorage
- Новые компоненты: params-panel.tsx, params-display.tsx, tag-input.tsx
- Типы: ai-params.ts с интерфейсом и дефолтами

### UI-дизайнер
- Compact mono metadata `text-xs font-mono text-gray-400` над assistant bubble
- Только non-default параметры отображаются
- Формат: `temp:0.7 | max:1024 | stop:["\n"] | sys:"Be concise"`
- Tailwind стили по существующей дизайн-системе (indigo/gray)

### API-дизайнер
- Nested `params` объект: `{ temperature?, maxTokens?, stop?, systemPrompt? }`
- Валидация: temp 0-2, maxTokens 1-4096, stop max 4 items x 64 chars, systemPrompt max 4000
- Response включает `appliedParams` с реально примененными значениями
- Полная обратная совместимость (params опциональный)

### DevOps
- Новые env vars для серверных лимитов (caps)
- Нет изменений в Docker
- Добавить structured logging для параметров
- Флаг: API key в .env — ротировать
