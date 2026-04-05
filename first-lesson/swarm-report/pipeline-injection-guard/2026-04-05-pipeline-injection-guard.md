# Pipeline Injection Guard

**Дата:** 2026-04-05
**Статус:** Done

---

## Описание задачи

Защита pipeline-режима обработки сообщений (planning → execution → validation → done) от пропуска стадий через prompt injection в пользовательском сообщении и инвариантах задач. Гарантия последовательного прохождения всех стадий.

---

## Итоги Research

Консилиум из 4 агентов (архитектор, фронтенд-эксперт, UI-дизайнер, API-дизайнер):
- Рекомендовано выделить отдельный `PipelineGuardService` (SRP, pipeline.service.ts уже ~935 строк)
- Порядок проверки: save message → sanitizer → [blocked? → SSE + assistant reply + end] → create pipeline_run
- UI: ShieldAlert иконка, amber цвет (не красный — красный занят failed)
- Final gate обязателен — SQL-проверка 3 completed steps
- injection_blocked отправляется ВМЕСТО pipeline_started (pipeline не создаётся)

---

## План реализации

13 шагов, 3 батча:
1. Batch 1: PipelineGuardService, усиление промптов, расширение parseValidation, типы frontend
2. Batch 2: интеграция санитайзера и INJECTION verdict в pipeline.service, SSE-обработчики в хуке
3. Batch 3: UI-компоненты (stepper, message bubble, controls)

---

## Что реализовано

### Backend

| Файл | Изменения |
|------|-----------|
| `backend/src/chat/services/pipeline-guard.service.ts` | **Новый файл.** PipelineGuardService с 18 regex-паттернов (RU+EN), checkMessage(), filterInvariants(), verifyStageIntegrity(), константы PIPELINE_SECURITY_BLOCK и VALIDATION_INJECTION_CHECK |
| `backend/src/chat/chat.module.ts` | Регистрация PipelineGuardService в providers |
| `backend/src/chat/services/pipeline.service.ts` | Усиление промптов PIPELINE_SECURITY_BLOCK; расширение VALIDATION_SYSTEM_PROMPT (VERDICT: INJECTION); санитайзер до создания pipeline_run; фильтрация инвариантов; обработка INJECTION verdict (мгновенный fail без retry); final gate SQL-проверка; SSE-события injection_blocked и injection_detected |

### Frontend

| Файл | Изменения |
|------|-----------|
| `frontend/src/types/pipeline.ts` | PipelineStatus += 'injection_blocked'; PipelineRunState += injectionMessage; PipelineSSEEvent += injection_blocked, injection_detected |
| `frontend/src/hooks/use-pipeline.ts` | Обработчики injection_blocked (терминальный) и injection_detected в handleEvent |
| `frontend/src/components/chat/pipeline-stepper.tsx` | ShieldAlert иконка, состояние 'injection', amber цвет |
| `frontend/src/components/chat/pipeline-message-bubble.tsx` | Amber alert-блок с ShieldAlert при injectionMessage |
| `frontend/src/components/chat/pipeline-controls.tsx` | Статус "Заблокировано" с ShieldAlert для injection_blocked |

---

## Архитектура защиты: 3 слоя

1. **Усиление промптов** — PIPELINE_SECURITY_BLOCK во всех системных промптах pipeline
2. **Программный санитайзер** — 18 regex-паттернов (RU+EN), проверка сообщений до pipeline + фильтрация инвариантов
3. **LLM-валидатор + Final Gate** — VERDICT: INJECTION + SQL-проверка 3 completed steps

---

## Результаты Validation

- Backend: `tsc --noEmit` — 0 ошибок
- Frontend: `next build` — Compiled successfully, все страницы сгенерированы

---

## Проблемы и откаты

Нет.

---

## Статус: Done
