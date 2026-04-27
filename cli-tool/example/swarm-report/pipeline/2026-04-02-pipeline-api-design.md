# API Design: Message Processing Pipeline

**Дата:** 2026-04-02
**Роль:** API-дизайнер
**Статус:** Спецификация (дизайн контрактов, без кода)

---

## 1. Обзор архитектуры

Каждое сообщение пользователя проходит через pipeline из 4 этапов:

```
planning -> execution -> validation -> done
                ^                |
                |   (failed)     |
                +----------------+
```

Pipeline -- это серверный процесс с персистентным состоянием. Фронтенд получает обновления через SSE и может приостановить/возобновить pipeline.

### Ключевые принципы

- Pipeline привязан к conversation и message -- это НЕ отдельная сущность верхнего уровня
- Идемпотентность через `Idempotency-Key` в заголовке
- SSE для real-time обновлений (уже используется в `test-dialogue`)
- Retry-логика на сервере, а не на клиенте
- Каждый step сохраняется в БД для возможности resume

---

## 2. Новая таблица БД

```sql
pipeline_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id     UUID NOT NULL,           -- логический ID pipeline (= ID assistant message)
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES messages(id),  -- user message, породивший pipeline
  step_type       VARCHAR(20) NOT NULL,    -- 'planning' | 'execution' | 'validation' | 'done'
  step_index      INT NOT NULL,            -- порядковый номер шага (0, 1, 2, ... для retry)
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                                           -- 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  input           JSONB,                   -- входные данные шага
  output          JSONB,                   -- результат шага (AI response, metadata)
  error           JSONB,                   -- ошибка, если status='failed'
  model           VARCHAR(50),             -- модель, использованная на этом шаге
  prompt_tokens   INT,
  completion_tokens INT,
  cost            DECIMAL(10,6),
  duration_ms     INT,
  attempt         INT NOT NULL DEFAULT 1,  -- номер попытки (для retry)
  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ,

  UNIQUE(pipeline_id, step_index)
);

-- Расширение таблицы messages:
ALTER TABLE messages ADD COLUMN pipeline_id UUID;
ALTER TABLE messages ADD COLUMN pipeline_status VARCHAR(20);
  -- 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
```

---

## 3. Эндпоинты

Все эндпоинты под `/chat/` -- вписываются в существующую структуру ChatController.

### 3.1. Запуск pipeline (отправка сообщения)

```
POST /api/chat/pipeline
```

Заменяет `POST /api/chat/message` для pipeline-режима. Старый эндпоинт остается для обратной совместимости (синхронный режим).

**Headers:**
```
Authorization: Bearer <jwt>
Content-Type: application/json
Idempotency-Key: <uuid>          -- обязательный, генерируется фронтом
Accept: text/event-stream         -- если хочет SSE; иначе 202 Accepted
```

**Request Body:**
```json
{
  "message": "string (1-4000 chars, required)",
  "conversationId": "uuid (optional -- создаст новый если не указан)",
  "branchId": "uuid (optional)",
  "params": {
    "model": "gpt-4o-mini | gpt-4o | gpt-4.1-nano | ...",
    "temperature": 0.0-2.0,
    "maxTokens": 1-32768,
    "systemPrompt": "string (max 4000)",
    "contextStrategy": "sliding_window | sticky_facts | branching",
    "strategyParams": {}
  },
  "pipelineConfig": {
    "planningModel": "gpt-4.1-mini (optional, override модели для этапа)",
    "validationModel": "gpt-4.1-nano (optional)",
    "maxRetries": 3,
    "autoRetryOnValidationFailure": true
  }
}
```

**Response (Accept: text/event-stream) -- SSE поток:**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Pipeline-Id: <uuid>

data: {"type":"pipeline:started","pipelineId":"uuid","conversationId":"uuid","steps":["planning","execution","validation","done"]}

data: {"type":"step:started","pipelineId":"uuid","step":"planning","stepIndex":0,"attempt":1}

data: {"type":"step:progress","pipelineId":"uuid","step":"planning","chunk":"partial content..."}

data: {"type":"step:completed","pipelineId":"uuid","step":"planning","stepIndex":0,"output":{"plan":"...","reasoning":"..."},"durationMs":1200,"cost":0.0012,"tokens":{"prompt":450,"completion":200}}

data: {"type":"step:started","pipelineId":"uuid","step":"execution","stepIndex":1,"attempt":1}

data: {"type":"step:completed","pipelineId":"uuid","step":"execution","stepIndex":1,"output":{"content":"...ответ AI...","model":"gpt-4o-mini"},"durationMs":3400,"cost":0.0034}

data: {"type":"step:started","pipelineId":"uuid","step":"validation","stepIndex":2,"attempt":1}

data: {"type":"step:completed","pipelineId":"uuid","step":"validation","stepIndex":2,"output":{"passed":true,"score":0.92,"checks":{"relevance":true,"completeness":true,"accuracy":true}}}

-- Если validation failed:
data: {"type":"step:completed","pipelineId":"uuid","step":"validation","stepIndex":2,"output":{"passed":false,"score":0.4,"reason":"Answer is off-topic","checks":{"relevance":false}}}

data: {"type":"pipeline:retry","pipelineId":"uuid","reason":"validation_failed","attempt":2,"returningTo":"planning"}

data: {"type":"step:started","pipelineId":"uuid","step":"planning","stepIndex":3,"attempt":2}

-- ... повторные шаги ...

data: {"type":"step:completed","pipelineId":"uuid","step":"done","stepIndex":3,"output":{"finalContent":"...финальный ответ...","totalAttempts":1}}

data: {"type":"pipeline:completed","pipelineId":"uuid","result":{"reply":"...","usage":{"promptTokens":1200,"completionTokens":800,"totalTokens":2000},"cost":0.0058,"durationMs":6200,"stepsCount":4,"conversationId":"uuid","assistantMessageId":"uuid"},"contextWindow":{"model":"gpt-4o-mini","maxTokens":128000,"usedTokens":2400,"usagePercent":2}}
```

**Response (Accept: application/json) -- асинхронный запуск:**

```
HTTP/1.1 202 Accepted
Location: /api/chat/pipeline/{pipelineId}

{
  "pipelineId": "uuid",
  "conversationId": "uuid",
  "status": "running",
  "currentStep": "planning",
  "createdAt": "2026-04-02T10:00:00Z",
  "_links": {
    "self": "/api/chat/pipeline/{pipelineId}",
    "events": "/api/chat/pipeline/{pipelineId}/events",
    "cancel": "/api/chat/pipeline/{pipelineId}/cancel"
  }
}
```

**Идемпотентность:**

Если `Idempotency-Key` уже использовался:
- Pipeline running -> возвращает текущий статус (200) или подключает к SSE
- Pipeline completed -> возвращает результат (200)
- Pipeline failed -> возвращает ошибку (200 с error в теле)

Срок хранения ключей: 24 часа.

---

### 3.2. Получение статуса pipeline

```
GET /api/chat/pipeline/{pipelineId}
```

**Response (200 OK):**
```json
{
  "pipelineId": "uuid",
  "conversationId": "uuid",
  "messageId": "uuid",
  "status": "running | paused | completed | failed | cancelled",
  "currentStep": "planning | execution | validation | done | null",
  "currentAttempt": 1,
  "totalAttempts": 1,
  "steps": [
    {
      "stepType": "planning",
      "stepIndex": 0,
      "status": "completed",
      "attempt": 1,
      "durationMs": 1200,
      "cost": 0.0012,
      "tokens": { "prompt": 450, "completion": 200 },
      "completedAt": "2026-04-02T10:00:01Z"
    },
    {
      "stepType": "execution",
      "stepIndex": 1,
      "status": "running",
      "attempt": 1,
      "startedAt": "2026-04-02T10:00:01Z"
    }
  ],
  "config": {
    "maxRetries": 3,
    "autoRetryOnValidationFailure": true
  },
  "createdAt": "2026-04-02T10:00:00Z",
  "updatedAt": "2026-04-02T10:00:01Z",
  "_links": {
    "self": "/api/chat/pipeline/{pipelineId}",
    "events": "/api/chat/pipeline/{pipelineId}/events",
    "pause": "/api/chat/pipeline/{pipelineId}/pause",
    "cancel": "/api/chat/pipeline/{pipelineId}/cancel",
    "conversation": "/api/conversations/{conversationId}"
  }
}
```

---

### 3.3. SSE-подключение к активному pipeline

```
GET /api/chat/pipeline/{pipelineId}/events
```

Подключение к потоку событий уже запущенного pipeline (например, после переподключения или перезагрузки страницы).

**Headers:**
```
Authorization: Bearer <jwt>
Accept: text/event-stream
Last-Event-ID: <stepIndex>       -- optional, для восстановления после разрыва
```

**Поведение:**
- Если pipeline running -- подключает к SSE, отправляет пропущенные события (после Last-Event-ID), затем live
- Если pipeline completed -- отправляет `pipeline:completed` и закрывает
- Если pipeline не найден -- 404

Каждое SSE событие содержит `id` (stepIndex) для reconnect:
```
id: 2
data: {"type":"step:completed","pipelineId":"uuid","step":"validation",...}
```

---

### 3.4. Пауза pipeline

```
POST /api/chat/pipeline/{pipelineId}/pause
```

**Request Body:** пустой или `{}`

**Response (200 OK):**
```json
{
  "pipelineId": "uuid",
  "status": "paused",
  "pausedAt": "2026-04-02T10:00:05Z",
  "pausedAfterStep": "planning",
  "nextStep": "execution",
  "message": "Pipeline paused. Use resume to continue."
}
```

**Поведение:**
- Пауза срабатывает МЕЖДУ шагами (текущий шаг дорабатывает до конца)
- Если pipeline уже paused -> 409 Conflict
- Если pipeline completed/cancelled -> 409 Conflict
- Если pipeline на последнем шаге -> 409 Conflict

**Response (409 Conflict):**
```json
{
  "error": {
    "code": "PIPELINE_ALREADY_PAUSED",
    "message": "Pipeline is already paused",
    "pipelineId": "uuid",
    "status": "paused"
  }
}
```

---

### 3.5. Возобновление pipeline

```
POST /api/chat/pipeline/{pipelineId}/resume
```

**Headers:**
```
Authorization: Bearer <jwt>
Accept: text/event-stream         -- optional, для SSE
```

**Request Body:**
```json
{
  "overrideParams": {
    "model": "gpt-4o (optional -- сменить модель для оставшихся шагов)",
    "temperature": 0.7
  }
}
```

**Response (Accept: text/event-stream):** SSE поток с оставшимися шагами

**Response (Accept: application/json, 200 OK):**
```json
{
  "pipelineId": "uuid",
  "status": "running",
  "resumedAt": "2026-04-02T10:05:00Z",
  "nextStep": "execution",
  "remainingSteps": ["execution", "validation", "done"]
}
```

**Поведение:**
- Если pipeline не paused -> 409 Conflict
- Продолжает с шага, на котором остановился
- `overrideParams` применяются только к оставшимся шагам

---

### 3.6. Отмена pipeline

```
POST /api/chat/pipeline/{pipelineId}/cancel
```

**Request Body:** пустой или `{}`

**Response (200 OK):**
```json
{
  "pipelineId": "uuid",
  "status": "cancelled",
  "cancelledAt": "2026-04-02T10:00:05Z",
  "completedSteps": ["planning"],
  "cancelledStep": "execution",
  "partialResult": {
    "plan": "...",
    "note": "Pipeline was cancelled during execution step. Partial results from completed steps are available."
  }
}
```

**Поведение:**
- Текущий шаг прерывается (AbortController на OpenAI вызов)
- Completed шаги сохраняются в БД
- Сообщение НЕ добавляется в conversation (pipeline не завершен)
- Если pipeline уже completed -> 409 Conflict

---

### 3.7. Получение результатов конкретного шага

```
GET /api/chat/pipeline/{pipelineId}/steps/{stepIndex}
```

**Response (200 OK):**
```json
{
  "pipelineId": "uuid",
  "stepType": "planning",
  "stepIndex": 0,
  "status": "completed",
  "attempt": 1,
  "input": {
    "userMessage": "...",
    "conversationContext": "summary of context used"
  },
  "output": {
    "plan": "1. Analyze the question...\n2. Research...\n3. Formulate response...",
    "reasoning": "User is asking about X, which requires knowledge of Y and Z",
    "estimatedComplexity": "medium"
  },
  "model": "gpt-4.1-mini",
  "tokens": {
    "prompt": 450,
    "completion": 200
  },
  "cost": 0.0012,
  "durationMs": 1200,
  "createdAt": "2026-04-02T10:00:00Z",
  "completedAt": "2026-04-02T10:00:01Z"
}
```

---

### 3.8. Список pipeline для conversation

```
GET /api/chat/conversations/{conversationId}/pipelines?limit=10&offset=0
```

**Response (200 OK):**
```json
{
  "items": [
    {
      "pipelineId": "uuid",
      "messageId": "uuid",
      "status": "completed",
      "stepsCount": 4,
      "totalCost": 0.0058,
      "totalDurationMs": 6200,
      "attempts": 1,
      "createdAt": "2026-04-02T10:00:00Z",
      "completedAt": "2026-04-02T10:00:06Z"
    }
  ],
  "total": 15,
  "limit": 10,
  "offset": 0
}
```

---

## 4. Формат ошибок

Единый формат для всех pipeline-эндпоинтов:

```json
{
  "error": {
    "code": "PIPELINE_ERROR_CODE",
    "message": "Human-readable description",
    "details": {},
    "retryable": true,
    "retryAfterMs": 5000
  }
}
```

### Каталог ошибок

| HTTP | Code | Описание | retryable |
|------|------|----------|-----------|
| 400 | `INVALID_PIPELINE_CONFIG` | Невалидная конфигурация pipeline | false |
| 404 | `PIPELINE_NOT_FOUND` | Pipeline не найден | false |
| 404 | `STEP_NOT_FOUND` | Шаг не найден | false |
| 409 | `PIPELINE_ALREADY_RUNNING` | Повторный запуск (без Idempotency-Key) | false |
| 409 | `PIPELINE_ALREADY_PAUSED` | Попытка pause на paused pipeline | false |
| 409 | `PIPELINE_ALREADY_COMPLETED` | Операция над завершенным pipeline | false |
| 409 | `PIPELINE_CANCELLED` | Операция над отмененным pipeline | false |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | Тот же ключ, другие параметры | false |
| 422 | `CONVERSATION_NOT_FOUND` | Диалог не найден | false |
| 429 | `RATE_LIMIT_EXCEEDED` | Превышен лимит | true |
| 500 | `AI_PROVIDER_ERROR` | Ошибка OpenAI | true |
| 500 | `AI_TIMEOUT` | Таймаут вызова AI | true |
| 500 | `STEP_EXECUTION_ERROR` | Ошибка выполнения шага | true |
| 503 | `AI_PROVIDER_UNAVAILABLE` | OpenAI недоступен | true |

### Ошибки на уровне шага (внутри SSE)

```
data: {"type":"step:error","pipelineId":"uuid","step":"execution","stepIndex":1,"error":{"code":"AI_TIMEOUT","message":"OpenAI call timed out after 60s","retryable":true},"action":"retrying","nextAttempt":2}
```

```
data: {"type":"pipeline:failed","pipelineId":"uuid","error":{"code":"AI_PROVIDER_ERROR","message":"Max retries exceeded for execution step","failedStep":"execution","attempts":3},"completedSteps":["planning"]}
```

---

## 5. Механизм доставки обновлений: SSE

### Почему SSE, а не WebSocket или Polling

| Критерий | SSE | WebSocket | Polling |
|----------|-----|-----------|---------|
| Уже используется в проекте | Да (test-dialogue) | Нет | Нет |
| Односторонний поток (server -> client) | Достаточно | Избыточно | --- |
| Автоматический reconnect | Встроен в EventSource API | Нужен вручную | --- |
| Last-Event-ID | Встроен | Нет | --- |
| Совместимость с JWT | Через query param | В handshake | В каждом запросе |
| Нагрузка на сервер | Низкая | Низкая | Высокая |

**Решение:** SSE с двумя режимами подключения:

1. **Inline SSE** -- при `Accept: text/event-stream` в `POST /pipeline`, SSE прямо в ответе (как `test-dialogue`)
2. **Reconnect SSE** -- `GET /pipeline/{id}/events` для переподключения

### SSE + JWT

Для `GET /pipeline/{id}/events` (EventSource API не поддерживает заголовки):

```
GET /api/chat/pipeline/{pipelineId}/events?token=<jwt>
```

Токен валидируется сервером. Срок жизни query-token: 5 минут (одноразовый, получается через отдельный эндпоинт или используется текущий access token).

---

## 6. Retry-логика

### Автоматический retry (server-side)

```
validation failed
  -> инкремент attempt
  -> если attempt <= maxRetries:
       -> перезапуск с planning (с контекстом предыдущей попытки)
       -> SSE: pipeline:retry event
  -> если attempt > maxRetries:
       -> pipeline status = failed
       -> SSE: pipeline:failed event
       -> сохранить лучший результат из попыток
```

### Что передается в повторный planning

```json
{
  "previousAttempt": {
    "plan": "...",
    "execution": "...",
    "validationResult": {
      "passed": false,
      "score": 0.4,
      "reason": "Answer is off-topic",
      "failedChecks": ["relevance"]
    }
  },
  "instruction": "Previous attempt failed validation. Adjust the plan to address: Answer is off-topic"
}
```

### Retry на уровне AI-вызова (transient errors)

- Таймаут OpenAI -> повтор до 2 раз с exponential backoff (1s, 3s)
- 429 от OpenAI -> повтор с Retry-After
- 500 от OpenAI -> повтор до 2 раз
- Эти retry прозрачны для пользователя (не меняют step/attempt)

---

## 7. Идемпотентность

### Механизм

1. Клиент генерирует `Idempotency-Key` (UUID v4) перед отправкой
2. Сервер хранит маппинг `key -> pipelineId` в таблице:

```sql
idempotency_keys (
  key         VARCHAR(64) PRIMARY KEY,
  pipeline_id UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,   -- SHA256 от тела запроса
  created_at  TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ DEFAULT now() + interval '24 hours'
);
```

3. При повторном запросе с тем же ключом:
   - Если `request_hash` совпадает -> вернуть текущий статус pipeline
   - Если `request_hash` НЕ совпадает -> 409 `IDEMPOTENCY_KEY_CONFLICT`

### Поведение по статусу при повторном запросе

| Pipeline status | HTTP | Ответ |
|----------------|------|-------|
| running | 200 | Текущий статус или подключение к SSE |
| paused | 200 | Статус с информацией о паузе |
| completed | 200 | Финальный результат |
| failed | 200 | Информация об ошибке |
| cancelled | 200 | Информация об отмене |

---

## 8. Обработка таймаутов AI

### Таймауты по шагам

| Шаг | Таймаут | Обоснование |
|-----|---------|-------------|
| planning | 30s | Короткий промпт, быстрый ответ |
| execution | 120s | Основной ответ, может быть длинным |
| validation | 30s | Оценка, короткий ответ |
| done | 5s | Только форматирование/сохранение |

### При таймауте

1. Прерывание текущего вызова (AbortController)
2. SSE event: `step:error` с `code: AI_TIMEOUT`
3. Автоматический retry с меньшим maxTokens (80% от исходного) -- до 2 попыток
4. Если все попытки исчерпаны:
   - Pipeline status = `failed`
   - Сохранение частичного результата
   - SSE event: `pipeline:failed`

---

## 9. Совместимость с существующим API

### Стратегия миграции

```
POST /api/chat/message       -- ОСТАЕТСЯ, синхронный режим (backward compatible)
POST /api/chat/pipeline      -- НОВЫЙ, pipeline режим
```

### Связь pipeline с conversation

- Pipeline ВСЕГДА привязан к conversation
- Если `conversationId` не указан -- создается новый conversation
- При `pipeline:completed` -- user message + assistant message добавляются в conversation (как сейчас)
- При `pipeline:cancelled`/`pipeline:failed` -- сообщения НЕ добавляются (pipeline не завершен)
- `pipeline_id` сохраняется в message для связи с метаданными шагов

### Получение pipeline-метаданных через существующий API

При загрузке conversation (`GET /conversations/{id}`) сообщения, прошедшие через pipeline, содержат дополнительное поле:

```json
{
  "id": "uuid",
  "role": "assistant",
  "content": "...",
  "pipelineId": "uuid",
  "pipelineStatus": "completed",
  ...
}
```

Клиент может запросить детали pipeline по `pipelineId` через `GET /chat/pipeline/{id}`.

---

## 10. Rate Limiting

| Эндпоинт | Лимит | Обоснование |
|-----------|-------|-------------|
| POST /chat/pipeline | 10 req/min | Каждый запускает 3-4 AI-вызова |
| GET /chat/pipeline/{id} | 60 req/min | Polling fallback |
| GET /chat/pipeline/{id}/events | 5 connections/user | SSE connections |
| POST /chat/pipeline/{id}/pause | 10 req/min | Управляющие операции |
| POST /chat/pipeline/{id}/resume | 10 req/min | Управляющие операции |
| POST /chat/pipeline/{id}/cancel | 10 req/min | Управляющие операции |

---

## 11. Типы SSE-событий (сводка)

| Event type | Когда | Ключевые поля |
|------------|-------|---------------|
| `pipeline:started` | Pipeline запущен | pipelineId, conversationId, steps[] |
| `pipeline:retry` | Validation failed, перезапуск | reason, attempt, returningTo |
| `pipeline:completed` | Успешное завершение | result (reply, usage, cost, contextWindow) |
| `pipeline:failed` | Все попытки исчерпаны | error, completedSteps[] |
| `pipeline:cancelled` | Отменен пользователем | completedSteps[], partialResult |
| `pipeline:paused` | Поставлен на паузу | pausedAfterStep, nextStep |
| `pipeline:resumed` | Возобновлен | nextStep, remainingSteps[] |
| `step:started` | Шаг начался | step, stepIndex, attempt |
| `step:progress` | Частичные данные (streaming) | step, chunk |
| `step:completed` | Шаг завершен | step, output, durationMs, cost, tokens |
| `step:error` | Ошибка шага | step, error, action (retrying/failing) |

---

## 12. Вопросы для обсуждения

1. **Нужен ли streaming внутри каждого шага?** Текущий дизайн отправляет `step:progress` с chunk-ами. Альтернатива -- только финальный результат шага. Streaming усложняет, но дает UX "печатающего AI".

2. **Где хранить Idempotency-Key?** Вариант A: отдельная таблица (предложен). Вариант B: Redis/in-memory (быстрее, но не переживает рестарт).

3. **Максимальное количество retry.** Предложено 3. Каждый retry = 3 AI-вызова (plan+exec+val). При maxRetries=3 это до 12 AI-вызовов на одно сообщение.

4. **Добавление сообщений в conversation.** Текущий вариант: только при completed. Альтернатива: добавлять user message сразу при старте pipeline (чтобы было видно в истории), а assistant message -- при completed. Но это создает "висящие" user messages без ответа при cancel.

---

## 13. Сводная таблица эндпоинтов

| Method | Path | Описание | Auth | Rate |
|--------|------|----------|------|------|
| POST | /api/chat/pipeline | Запуск pipeline | JWT | 10/min |
| GET | /api/chat/pipeline/{id} | Статус pipeline | JWT | 60/min |
| GET | /api/chat/pipeline/{id}/events | SSE-поток | JWT (query) | 5 conn |
| GET | /api/chat/pipeline/{id}/steps/{idx} | Результат шага | JWT | 60/min |
| POST | /api/chat/pipeline/{id}/pause | Пауза | JWT | 10/min |
| POST | /api/chat/pipeline/{id}/resume | Возобновление | JWT | 10/min |
| POST | /api/chat/pipeline/{id}/cancel | Отмена | JWT | 10/min |
| GET | /api/chat/conversations/{id}/pipelines | Список pipelines | JWT | 30/min |
| POST | /api/chat/message | (существующий, без изменений) | JWT | 20/min |
