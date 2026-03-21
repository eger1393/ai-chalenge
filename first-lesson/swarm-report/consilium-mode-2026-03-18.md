# Report: Режим Консилиум

Дата: 2026-03-18
Статус: Done

## Описание задачи
Добавить режим "Консилиум" — параллельный опрос нескольких экспертов (до 3) с разными системными промптами, с последующим синтезом всех мнений в единый ответ.

## Итоги Research
- GigaChat API поддерживает параллельные запросы (каждый со своим system prompt)
- Синтез реализован через дополнительный запрос с ролью "модератор консилиума"
- Формат запроса/ответа OpenAI-совместимый — переиспользуется существующая OAuth-логика

## План
- Backend: новый endpoint POST /api/chat/consilium + метод sendConsilium в ChatService
- Frontend: toggle в настройках, карточки экспертов, отображение мнений + синтеза

## Что реализовано

### Backend (3 файла)
- `backend/src/chat/dto/consilium.dto.ts` (NEW) — ExpertDto (name + systemPrompt), ConsiliumMessageDto (message, history, experts 2-3, model/temperature/maxTokens)
- `backend/src/chat/chat.service.ts` — метод sendConsilium(): Phase 1 — параллельные запросы через Promise.all, Phase 2 — синтез с промптом модератора. Возвращает reply, expertOpinions[], usage, appliedParams
- `backend/src/chat/chat.controller.ts` — POST /chat/consilium с JwtAuthGuard и Throttle

### Frontend (8 файлов)
- `frontend/src/types/ai-params.ts` — типы Expert, ConsiliumParams, ExpertOpinion, DEFAULT_CONSILIUM
- `frontend/src/lib/api.ts` — функция sendConsilium()
- `frontend/src/hooks/use-consilium.ts` (NEW) — hook с localStorage persistence, toggleConsilium, setExpert, addExpert, removeExpert
- `frontend/src/hooks/use-chat.ts` — Message расширен expertOpinions + isConsilium, send() поддерживает consilium mode
- `frontend/src/components/chat/consilium-panel.tsx` (NEW) — toggle + карточки экспертов (имя + промпт), add/remove, валидация min 2
- `frontend/src/components/chat/ai-params-panel.tsx` — интеграция ConsiliumPanel, скрытие System Prompt при активном консилиуме
- `frontend/src/components/chat/message-bubble.tsx` — collapsible "Мнения экспертов" + лейбл "Синтез консилиума"
- `frontend/src/components/chat/chat-window.tsx` — интеграция useConsilium, проброс props

## Результаты Validation
- ✅ Backend build без ошибок
- ✅ Frontend build без ошибок
- ✅ Деплой на сервер (167.235.226.104:6500/6501) — оба контейнера Up

## Архитектура решения

```
User message
    ↓
[Consilium enabled?]
    ↓ yes
┌─────────────────────────┐
│ Phase 1: Parallel        │
│ Expert 1 (system prompt) │──→ GigaChat → opinion 1
│ Expert 2 (system prompt) │──→ GigaChat → opinion 2
│ Expert 3 (system prompt) │──→ GigaChat → opinion 3
└─────────────────────────┘
    ↓ all done
┌─────────────────────────┐
│ Phase 2: Synthesis       │
│ Moderator prompt +       │
│ all expert opinions      │──→ GigaChat → final reply
└─────────────────────────┘
    ↓
Response: { reply, expertOpinions[], usage, appliedParams }
```

## Проблемы и откаты
Нет

## Статус: Done
