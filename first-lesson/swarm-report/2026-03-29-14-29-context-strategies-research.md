# Research: 3 стратегии управления контекстом

Дата: 2026-03-29

## Задача
Реализовать 3 стратегии управления контекстом с переключателем:
1. Sliding Window — последние N сообщений
2. Sticky Facts / Key-Value Memory — facts + последние N сообщений
3. Branching — checkpoint, ветки, переключение

## Решения консилиума

### Архитектура
- **Per-conversation стратегия** — хранится в `conversations.context_strategy`, фиксируется при создании
- **Strategy pattern** — `ContextStrategyService` в chat module, три реализации
- **Рефакторинг обязателен** — вынести текущий `truncateMessages()` из chat.service.ts перед добавлением стратегий
- **summaryMode deprecated** — заменяется стратегией sliding_window

### БД — 3 миграции
- 005: `conversations.context_strategy VARCHAR(30) DEFAULT 'sliding_window'`, `context_strategy_params JSONB`
- 006: таблица `conversation_facts` (conversation_id, fact_key, fact_value, source, UNIQUE(conversation_id, fact_key))
- 007: таблица `conversation_branches` + `messages.branch_id` + `conversations.active_branch_id`

### API — 12 новых + 4 модифицированных
- Facts: GET/PUT/PATCH /conversations/:id/facts, DELETE /conversations/:id/facts/:key
- Branches: CRUD + activate
- Checkpoints: POST/GET/DELETE /conversations/:id/checkpoints
- Модификация: POST /conversations (+ contextStrategy), GET /conversations/:id (+ strategy data), POST /chat/message (+ branchId)

### Frontend
- Сегментированный переключатель в ai-params-panel (при создании диалога)
- FactsPanel — коллапсируемая панель над input
- BranchSelector — dropdown в header чата + BranchTree modal
- Новые хуки: useFacts, useBranches
- Новые компоненты: context-strategy-selector, facts-panel, branch-selector, branch-point, branch-tree-modal

### Ограничения (по согласованию с пользователем)
- Смена стратегии после создания диалога ЗАПРЕЩЕНА
- Facts с авто-извлечением через AI (дополнительный вызов gpt-4.1-nano)
- Branching: глубина вложенности ≤ 3 уровня

### Порядок реализации
1. Рефакторинг chat.service.ts (Strategy pattern)
2. Миграции БД
3. Sliding Window
4. Sticky Facts
5. Branching

### Инфраструктура
- Docker/compose изменений НЕ требуется
- Новых env-переменных НЕ требуется
