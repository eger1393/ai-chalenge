# Report: Конфигурируемые параметры AI запросов

Дата: 2026-03-17
Статус: Done

## Описание задачи
Добавить на фронте панель конфигурации параметров AI запросов (temperature, max_tokens, stop sequences, system prompt). Параметры применяются к каждому сообщению. Перед ответом нейронки отображать примененные параметры в кратком техническом виде.

## Итоги Research
Консилиум из 5 агентов (Архитектор, Frontend-эксперт, UI-дизайнер, API-дизайнер, DevOps) провёл параллельный анализ. Ключевые решения:
- Параметры как вложенный `params` объект в MessageDto
- Коллапсируемая панель над полем ввода (gear icon toggle)
- React hook useAIParams + localStorage для персистентности
- appliedParams на каждом Message для точного отображения
- Backend валидация + clamping серверных лимитов

## План
12 шагов: 3 backend (DTO, service, validation) + 6 frontend (types, hooks, API, components) + 3 integration (MessageBubble, ChatWindow, ChatInput). Backend и frontend выполнялись параллельно.

## Что реализовано

### Backend (3 файла)
- `backend/src/chat/dto/ai-params.dto.ts` (NEW) — AIParamsDto с class-validator декораторами
- `backend/src/chat/dto/message.dto.ts` — расширен optional params field
- `backend/src/chat/chat.service.ts` — clamping параметров, system prompt prepend, appliedParams в response

### Frontend (6 новых + 4 изменённых файла)
- `frontend/src/types/ai-params.ts` (NEW) — AIParams, AppliedParams интерфейсы, DEFAULT_AI_PARAMS
- `frontend/src/hooks/use-ai-params.ts` (NEW) — hook с localStorage persistence, SSR-safe
- `frontend/src/components/chat/ai-params-panel.tsx` (NEW) — панель: temperature slider, max_tokens input, stop sequences, system prompt textarea, reset button
- `frontend/src/components/chat/applied-params-display.tsx` (NEW) — compact mono metadata (только non-default)
- `frontend/src/lib/api.ts` — sendMessage принимает params, возвращает appliedParams
- `frontend/src/hooks/use-chat.ts` — send(text, params), appliedParams на Message
- `frontend/src/components/chat/message-bubble.tsx` — рендерит AppliedParamsDisplay
- `frontend/src/components/chat/chat-window.tsx` — интеграция useAIParams, панель, handleSend
- `frontend/src/components/chat/chat-input.tsx` — gear toggle button с индикатором

## Результаты Validation

### Backend (curl)
- ✅ Сборка без ошибок
- ✅ POST /api/chat/message с params: temperature 0.3, systemPrompt "Reply in exactly one word" — ответ "Hello", appliedParams корректны
- ✅ POST /api/chat/message без params — дефолты temperature 1, maxTokens 2048
- ✅ Обратная совместимость сохранена

### Frontend (Chrome MCP)
- ✅ Сборка без ошибок
- ✅ Gear-иконка рядом с полем ввода, подсвечивается при открытии
- ✅ Панель открывается/закрывается по клику
- ✅ Все 4 контрола: slider, number input, tag input, textarea со счётчиком
- ✅ localStorage persistence — параметры сохраняются после перезагрузки
- ✅ Сообщение с temp:0.3 + sys:"Respond in JSON format only" — ответ в JSON, метаданные отображены
- ✅ Reset сбрасывает к дефолтам
- ✅ При дефолтных параметрах метаданные не отображаются

## Проблемы и откаты
1. Двойной toggle (ChatWindow showParams + AIParamsPanel internal open state) — исправлено удалением внутреннего collapsible
2. .env с $$ в bcrypt hash — скопировано в backend/.env с одинарными $

## Статус: Done
