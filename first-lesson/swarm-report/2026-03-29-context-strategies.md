# Фича: 3 стратегии управления контекстом

Дата: 2026-03-29

## Описание задачи
Реализация 3 стратегий управления контекстом с переключателем:
1. Sliding Window — хранить только последние N сообщений
2. Sticky Facts / Key-Value Memory — блок фактов + последние N сообщений
3. Branching — checkpoint, ветки диалога, переключение

## Итоги Research (сводка консилиума)
- Консилиум из 5 агентов (Архитектор, Фронтенд-эксперт, UI-дизайнер, API-дизайнер, DevOps)
- Единогласно: стратегия per-conversation, Strategy pattern на бэкенде
- 3 миграции БД, 12 новых + 4 модифицированных API эндпоинта
- Стратегия фиксируется при создании диалога (смена запрещена)

## План (из стадии Plan)
10 этапов: рефакторинг backend → миграции → Sliding Window → Sticky Facts → Branching → типы/API frontend → переключатель UI → каждая стратегия UI

## Что реализовано

### Backend (14 новых/модифицированных файлов)

Новые файлы:
- `backend/src/chat/services/token.service.ts` — TokenService (countTokens, encoding cache)
- `backend/src/chat/services/openai.service.ts` — OpenAIService (callOpenAI, calculateCost)
- `backend/src/chat/services/context-strategy.service.ts` — фабрика стратегий
- `backend/src/chat/services/facts.service.ts` — CRUD facts + AI extraction через gpt-4.1-nano
- `backend/src/chat/services/branch.service.ts` — branches CRUD + ensureMainBranch
- `backend/src/chat/strategies/context-strategy.interface.ts` — интерфейс IContextStrategy
- `backend/src/chat/strategies/sliding-window.strategy.ts` — SlidingWindowStrategy
- `backend/src/chat/strategies/sticky-facts.strategy.ts` — StickyFactsStrategy
- `backend/src/chat/strategies/branching.strategy.ts` — BranchingStrategy

Модифицированные:
- `backend/src/chat/chat.service.ts` — рефакторинг, делегирование сервисам
- `backend/src/chat/chat.controller.ts` — 8 новых эндпоинтов (facts + branches)
- `backend/src/chat/chat.module.ts` — 8 новых providers
- `backend/src/chat/dto/message.dto.ts` — branchId поле
- `backend/src/database/database.service.ts` — 3 миграции (005-007)
- `backend/src/conversation/conversation.service.ts` — contextStrategy в create/findAll/findOne, branchId в addMessage
- `backend/src/conversation/conversation.controller.ts` — передача contextStrategy
- `backend/src/conversation/dto/create-conversation.dto.ts` — contextStrategy поле

### Frontend (5 новых + 10 модифицированных файлов)

Новые файлы:
- `frontend/src/components/chat/strategy-selector.tsx` — сегментированный переключатель стратегий
- `frontend/src/components/chat/facts-panel.tsx` — панель фактов (inline edit, add, remove)
- `frontend/src/components/chat/branch-selector.tsx` — навигатор веток
- `frontend/src/hooks/use-facts.ts` — хук работы с фактами
- `frontend/src/hooks/use-branches.ts` — хук работы с ветками

Модифицированные:
- `frontend/src/types/ai-params.ts` — ContextStrategyType, новые поля AIParams
- `frontend/src/types/conversation.ts` — ConversationFact, ConversationBranch
- `frontend/src/lib/api.ts` — новые API-функции для facts/branches
- `frontend/src/hooks/use-ai-params.ts` — миграция localStorage
- `frontend/src/hooks/use-chat.ts` — передача contextStrategy
- `frontend/src/hooks/use-conversations.ts` — contextStrategy в create
- `frontend/src/components/chat/ai-params-panel.tsx` — StrategySelector вместо summaryMode
- `frontend/src/components/chat/chat-layout.tsx` — интеграция facts/branches
- `frontend/src/components/chat/message-bubble.tsx` — кнопка создания ветки
- `frontend/src/components/chat/conversation-sidebar.tsx` — badge стратегии

### БД (3 миграции)
- 005: conversations.context_strategy (VARCHAR, DEFAULT 'sliding_window')
- 006: таблица conversation_facts (UPSERT по conversation_id + fact_key)
- 007: таблица conversation_branches + messages.branch_id + conversations.active_branch_id

## Результаты Validation
- Платформы: Backend
- TypeScript компиляция backend: OK
- TypeScript компиляция frontend: OK
- Build backend: OK
- Build frontend: OK
- Все файлы на месте: OK
- Миграции зарегистрированы: OK
- API эндпоинты зарегистрированы: OK

## Проблемы и откаты
Нет.

## Статус: Done
