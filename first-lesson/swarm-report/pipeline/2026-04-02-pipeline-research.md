# Research: Поэтапная обработка сообщений (Pipeline)
**Дата:** 2026-04-02

## Сводка консилиума

### Архитектор
- Новые таблицы `pipeline_runs` + `pipeline_steps` (не расширять messages)
- Выделенный `PipelineService` как владелец state machine
- Pause через флаг в БД, проверка после каждого шага
- SSE для доставки прогресса (прецедент есть в test-dialogue)
- Retry: новые steps с инкрементированным attempt_number + контекст провала
- Feature flag `pipeline: true` в params для обратной совместимости
- При краше сервера: startup job переводит активные pipelines в paused

### Фронтенд-эксперт
- Расширить Message типом `pipeline?: PipelineState`
- SSE-транспорт по аналогии с `startTestDialogue`
- Горизонтальный stepper + accordion для результатов этапов
- Модификация use-chat.ts: sync send → event-driven SSE
- Новые компоненты: pipeline-stepper, pipeline-stage-detail, pipeline-controls, pipeline-debug-panel
- Edge cases: reconnect при потере соединения, guard на параллельные pipelines

### UI-дизайнер
- Вертикальный mini-stepper слева от контента (desktop), горизонтальный над пузырём (mobile)
- Цвета этапов: planning=amber, execution=indigo, validation=violet, done=emerald
- Pause: кнопка в заголовке этапа, при паузе пузырь тускнеет + amber-баннер
- Retry: красный разделитель "Retry #N", предыдущая итерация сворачивается
- Debug-панель расширяется данными по каждому шагу каждой итерации

### API-дизайнер
- Отдельный эндпоинт `POST /api/chat/pipeline` (не модифицировать /chat/message)
- SSE inline при Accept: text/event-stream + GET /pipeline/{id}/events для reconnect
- Pause/Resume/Cancel: POST /chat/pipeline/{id}/pause|resume|cancel
- Idempotency-Key в заголовке для защиты от дублей
- Сообщения в conversation только при pipeline:completed
- Retry на двух уровнях: pipeline (видимый) + AI transient errors (прозрачный)

## Ключевые решения (консенсус)
1. **БД:** отдельные таблицы pipeline_runs + pipeline_steps
2. **Транспорт:** SSE (уже есть в проекте)
3. **API:** отдельный endpoint POST /chat/pipeline
4. **Pause:** флаг в БД, срабатывает между шагами
5. **Retry:** max 3 попытки, с передачей контекста провала
6. **Фронт:** stepper + accordion + controls в message-bubble
