# Фича: Pipeline — поэтапная обработка сообщений
**Дата:** 2026-04-02

## Описание задачи
Переработка процесса обработки сообщений. Каждое сообщение проходит 4 этапа: planning → execution → validation → done. Если validation провалился — возврат в planning (до 3 попыток).

## Итоги Research (сводка консилиума)
- Архитектор: отдельные таблицы pipeline_runs + pipeline_steps, PipelineService как state machine
- Фронтенд: SSE-транспорт, stepper + accordion, usePipeline hook
- UI-дизайнер: горизонтальный stepper, цветовые статусы, pause/resume UX
- API-дизайнер: POST /chat/pipeline (SSE), pause/resume/cancel endpoints

## План
16 шагов: миграция БД → DTO → OpenAI streaming → PipelineService → endpoints → module → типы → API → hook → stepper → accordion → controls → bubble → тогл → интеграция → debug

## Что реализовано

### Backend
| Файл | Что сделано |
|------|-------------|
| database.service.ts | Миграция 016: таблицы pipeline_runs, pipeline_steps |
| openai.service.ts | Метод callOpenAIStream() — AsyncGenerator для стриминга |
| dto/pipeline.dto.ts | PipelineMessageDto с валидацией |
| services/pipeline.service.ts | State machine: runPipeline, pausePipeline, resumePipeline, cancelPipeline, getPipelineRun. Системные промпты на русском |
| chat.controller.ts | 5 endpoints: POST /pipeline (SSE), GET /pipeline/:id, POST pause/resume/cancel |
| chat.module.ts | Регистрация PipelineService |

### Frontend
| Файл | Что сделано |
|------|-------------|
| types/pipeline.ts | Типы: PipelineStepType, PipelineStatus, PipelineRunState, PipelineSSEEvent |
| types/ai-params.ts | Добавлено pipelineMode в AIParams |
| lib/api.ts | 5 API функций: startPipeline (SSE), resumePipeline (SSE), pausePipeline, cancelPipeline, getPipelineRun |
| hooks/use-pipeline.ts | Hook с SSE state machine |
| hooks/use-ai-params.ts | Поддержка pipelineMode в localStorage |
| components/chat/pipeline-stepper.tsx | Горизонтальный stepper (4 шага с анимацией) |
| components/chat/pipeline-accordion.tsx | Accordion с результатами каждого этапа |
| components/chat/pipeline-controls.tsx | Кнопки Pause/Resume/Cancel |
| components/chat/pipeline-message-bubble.tsx | Композитный bubble |
| components/chat/ai-params-panel.tsx | Тогл Pipeline mode |
| components/chat/chat-layout.tsx | Интеграция pipeline в основной flow |

## Результаты Validation
- Backend: `npx tsc --noEmit` — 0 ошибок
- Frontend: `npx next build` — Compiled successfully, все страницы сгенерированы

## Ключевые решения
- SSE для real-time прогресса (по аналогии с test-dialogue)
- gpt-4.1-nano для planning/validation (экономия), модель пользователя для execution
- Pause через флаг в БД, проверка между шагами
- Pipeline mode опциональный (тогл на фронте)
- Retry до 3 раз с передачей контекста провала

## Проблемы и откаты
Нет

## Статус: Done
