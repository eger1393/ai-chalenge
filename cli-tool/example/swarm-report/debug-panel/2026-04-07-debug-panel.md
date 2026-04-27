# Дебаг-панель для сообщений чата

**Дата:** 2026-04-07  
**Статус:** Done

## Описание задачи

Реализация полноценной дебаг-панели у каждого сообщения в чате с lazy-load загрузкой данных. Панель показывает стадии pipeline, входные/выходные данные, токены, стоимость, контекст, модель и параметры.

## Итоги Research

Консилиум из 3 агентов (архитектор, фронтенд-эксперт, UI-дизайнер) выявил:
- Backend хранит все нужные данные в таблицах message_steps, message_meta, message_debug
- Компонент DebugPanel уже существовал, но данные никогда не попадали в него
- Главный пробел — отсутствие API endpoint и data pipeline от БД до компонента

## План

1. Backend: добавить getMetaByMessageId() + endpoint GET /messages/:id/debug
2. Frontend: API функция + lazy load в MessageBubble
3. UI: summary bar, горизонтальные табы, timeline, кнопки копирования
4. SSE: парсить meta из step_complete и done events

## Что реализовано

### Backend
- `message.repository.ts` — добавлен метод `getMetaByMessageId()`
- `message.controller.ts` — добавлен endpoint `GET /messages/:id/debug` с параллельной загрузкой meta + debug + steps и агрегацией pipeline данных

### Frontend
- `types/conversation.ts` — добавлено поле `meta` в `MessageDebugData`
- `lib/api.ts` — добавлена функция `getMessageDebug()`
- `message-bubble.tsx` — lazy load debug данных при клике на кнопку Debug, извлечение envelopeId из messageId
- `debug-panel.tsx` — полная переработка UI:
  - Summary bar с ключевыми метриками (модель, токены, стоимость, длительность, контекст)
  - Горизонтальные мини-табы (Pipeline, Память, Токены, Факты, Стратегия)
  - Timeline-соединители для pipeline steps
  - CopyButton для входных данных, результатов и слоёв памяти
- `use-pipeline.ts` — обогащение SSE events: step_start (model), step_complete (tokens, cost, durationMs), done (totalCost, totalTokens)

## Результаты Validation

- Backend: `tsc --noEmit` — 0 ошибок
- Frontend: `next build` — compiled successfully, все страницы собраны

## Проблемы и откаты

Нет.

## Статус: Done
