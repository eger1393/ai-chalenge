# Фича: Подсчёт токенов с разделением метрик

Дата: 2026-03-25

## Описание задачи
Добавить в ChatGPT-клиент подсчёт токенов с разделением на три метрики:
- Токены текущего сообщения пользователя (currentMessageTokens)
- Токены истории диалога (historyTokens)
- Токены ответа модели (completionTokens)

Плюс агрегация по всему диалогу (conversationTotals).

## Итоги Research
Консилиум из 5 агентов (архитектор, фронтенд, UI-дизайнер, API-дизайнер, DevOps) выявил:
- Данные о токенах уже сохраняются в БД, но теряются при загрузке истории
- OpenAI не разделяет prompt_tokens на запрос и историю — нужна библиотека tiktoken
- Обнаружены баги: chat-layout не передаёт usage в MessageBubble, loadConversation не маппит токены

## План
12 шагов: 6 backend + 6 frontend. Установка js-tiktoken, замена эвристики на точный подсчёт, добавление разбивки в API response, агрегация по диалогу, исправление багов, обновление UI.

## Что реализовано

### Backend
- **backend/package.json** — добавлена зависимость js-tiktoken
- **backend/src/chat/chat.service.ts** — заменён estimateTokens() на countTokens() через tiktoken с кэшированием и fallback. Добавлен countTokensBreakdown() для раздельного подсчёта. В response sendMessage и sendConsilium добавлены currentMessageTokens, historyTokens, systemPromptTokens, conversationTotals.
- **backend/src/conversation/conversation.service.ts** — добавлен метод getConversationTotals() (SQL-агрегация). Исправлен маппинг findOne() — snake_case → camelCase для token-полей и expertOpinions.

### Frontend
- **frontend/src/types/ai-params.ts** — Usage расширен полями currentMessageTokens, historyTokens, systemPromptTokens
- **frontend/src/types/conversation.ts** — ConversationMessage расширен полями usage, durationMs, tokenCount, promptTokens, completionTokens. Добавлен интерфейс ConversationTotals.
- **frontend/src/hooks/use-chat.ts** — добавлен state conversationTotals. Исправлен loadConversation — маппит token-поля из БД. Добавлена обработка conversationTotals в обоих ветках send.
- **frontend/src/lib/api.ts** — добавлен ConversationTotals в типы ответа sendMessage и sendConsilium.
- **frontend/src/components/chat/chat-layout.tsx** — исправлен баг: теперь передаёт usage и durationMs в MessageBubble. Передаёт conversationTotals в ContextIndicator.
- **frontend/src/components/chat/applied-params-display.tsx** — показывает расширенную разбивку токенов (запрос/история/ответ) для свежих сообщений, fallback на старый формат для загруженных из истории.
- **frontend/src/components/chat/context-indicator.tsx** — расширен: показывает абсолютные цифры контекста и суммарные токены/стоимость диалога.

## Результаты Validation
Платформа: Backend
- TypeScript компиляция: OK (backend + frontend)
- Сборка: OK (backend + frontend)
- Все 12 проверок E2E сценария пройдены

## Исправленные попутно баги
1. chat-layout.tsx не передавал usage и durationMs в MessageBubble — данные о токенах не отображались
2. loadConversation не маппил token-поля из БД — при переключении диалогов статистика пропадала
3. findOne в conversation.service.ts отдавал snake_case поля — фронтенд не мог их использовать

## Статус: Done
