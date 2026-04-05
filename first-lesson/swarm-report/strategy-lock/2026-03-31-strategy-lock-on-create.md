# Bug Fix: Стратегия контекста фиксируется при создании диалога

**Дата:** 2026-03-31
**Статус:** Fixed

## Описание проблемы

При создании нового диалога (особенно через задачу) стратегия контекста сразу фиксировалась, не давая пользователю выбрать другую до отправки первого сообщения.

## Root Cause

Три связанные проблемы:

1. **Frontend effect** (`chat-layout.tsx:65-87`): при загрузке любой конversации `setConversationStrategy(strategy)` устанавливалась из БД, блокируя селектор, даже для пустых конversаций (0 сообщений).

2. **Frontend task creation** (`chat-layout.tsx:136-147`): `handleNewConversationInTask` не передавал `contextStrategy` при создании, записывая дефолтный `sliding_window`.

3. **Backend** (`chat.service.ts:74`): стратегия всегда бралась из БД, игнорируя выбор пользователя в params.

## Что исправлено

### Frontend

| Файл | Изменение |
|------|-----------|
| `hooks/use-chat.ts` | `loadConversation` теперь возвращает `detail` (или `null`) |
| `chat-layout.tsx` (effect) | Стратегия блокируется только если `detail.messages.length > 0` |
| `chat-layout.tsx` (handleSend) | Стратегия фиксируется после первого `send()` если ещё не зафиксирована |
| `chat-layout.tsx` (handleNewConversationInTask) | Передаёт `params.contextStrategy` при создании |

### Backend

| Файл | Изменение |
|------|-----------|
| `conversation.service.ts` | Добавлен метод `updateStrategy(conversationId, strategy)` |
| `chat.service.ts` | При первом сообщении (messageCount === 0) обновляет стратегию в БД из params |

## Validation

- Backend: TypeScript compilation — OK
- Frontend: TypeScript compilation — OK
