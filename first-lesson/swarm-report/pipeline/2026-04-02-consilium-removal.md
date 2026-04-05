# Удаление режима Консилиум

**Дата:** 2026-04-02

## Краткое описание

Полное удаление функциональности "Режим Консилиум" из фронтенда и бэкенда. Консилиум позволял отправлять запрос нескольким AI-экспертам параллельно и получать синтезированный ответ.

## Research

Консилиум реализован в 12+ файлах:

**Backend (NestJS):**
- DTO для консилиума
- Контроллер с эндпоинтами
- Сервис консилиума
- Константы ролей экспертов
- Сервис разговоров с логикой мнений экспертов

**Frontend (React/Next.js):**
- Хук для управления консилиумом
- Панель консилиума
- Типы данных
- API функции
- Компоненты интеграции в чат

## Что было сделано

### Backend — удалены файлы
- `src/chat/dto/consilium.dto.ts`
- `src/chat/constants/expert-roles.ts`

### Backend — отредактированы файлы
- `src/chat/chat.service.ts` — удалён метод `sendConsilium()`
- `src/chat/chat.controller.ts` — удалены эндпоинты `POST /chat/consilium` и `GET /chat/roles`
- `src/conversation/conversation.service.ts` — удалена логика `expert_opinions`, методы `addExpertOpinions()`, метаданные `isConsilium`
- `src/chat/services/branch.service.ts` — удалено поле `is_consilium` из сообщений ветки

### Frontend — удалены файлы
- `src/hooks/use-consilium.ts`
- `src/components/chat/consilium-panel.tsx`

### Frontend — отредактированы файлы
- `src/types/ai-params.ts` — удалены типы `Expert`, `Role`, `ConsiliumParams`, `DEFAULT_CONSILIUM`, `ExpertOpinion`
- `src/lib/api.ts` — удалены функции `sendConsilium()`, `fetchRoles()`
- `src/hooks/use-chat.ts` — удалена ветка консилиума из метода `send()`
- `src/components/chat/chat-window.tsx` — удалена интеграция консилиума
- `src/components/chat/chat-layout.tsx` — удалена интеграция консилиума
- `src/components/chat/ai-params-panel.tsx` — удалён рендеринг `ConsiliumPanel`
- `src/components/chat/message-bubble.tsx` — удалён компонент `ExpertOpinionsAccordion`

### Не изменены (намеренно)

- `database.service.ts` — DDL-миграции оставлены без изменений (колонка `is_consilium`, таблица `expert_opinions`)
- `conversation.service.ts` INSERT — передаёт `false` в `is_consilium` (соблюдается NOT NULL constraint)

## Validation

- TypeScript компиляция успешна как для бэкенда, так и для фронтенда
- Найденных "зависших" ссылок нет (grep проверка пройдена)

## Статус

✅ **Done**
