# REST API Specification: 3-Level Memory

**Version:** 2.0.0-draft
**Base URL:** `http://localhost:3000/api`
**Date:** 2026-03-31

Расширение существующего API для поддержки 3-уровневой памяти:
- **Long-term** (UserProfile) -- долговременная, 1 на пользователя
- **Working** (Task) -- рабочая, группирует диалоги
- **Short-term** (Conversation + Facts) -- кратковременная, то что уже есть

---

## 1. Новые таблицы БД

```sql
-- Долговременная память: профиль пользователя (1 на username)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) NOT NULL UNIQUE,
  language VARCHAR(10) NOT NULL DEFAULT 'auto'
    CHECK (language IN ('ru', 'en', 'auto')),
  dialog_style VARCHAR(20) NOT NULL DEFAULT 'friendly'
    CHECK (dialog_style IN ('formal', 'friendly', 'technical', 'creative')),
  response_length VARCHAR(20) NOT NULL DEFAULT 'not_set'
    CHECK (response_length IN ('brief', 'detailed', 'not_set')),
  custom_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Рабочая память: задачи
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_username ON tasks(username);
CREATE INDEX idx_tasks_username_updated ON tasks(username, updated_at DESC);

-- Связь: conversations.task_id (nullable FK)
ALTER TABLE conversations ADD COLUMN task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX idx_conversations_task_id ON conversations(task_id);
```

---

## 2. TypeScript-интерфейсы

```typescript
// ============================
// Long-term memory: UserProfile
// ============================

type Language = 'ru' | 'en' | 'auto';
type DialogStyle = 'formal' | 'friendly' | 'technical' | 'creative';
type ResponseLength = 'brief' | 'detailed' | 'not_set';

interface UserProfile {
  id: string;
  username: string;
  language: Language;
  dialogStyle: DialogStyle;
  responseLength: ResponseLength;
  customPrompt: string | null;
  updatedAt: string; // ISO 8601
}

// ============================
// Working memory: Task
// ============================

interface Task {
  id: string;
  username: string;
  title: string;
  description: string | null;
  isArchived: boolean;
  conversationCount: number; // computed, not stored
  createdAt: string;
  updatedAt: string;
}

interface TaskDetail extends Task {
  conversations: TaskConversationSummary[];
}

interface TaskConversationSummary {
  id: string;
  title: string;
  model: string;
  contextStrategy: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ============================
// Memory Debug (расширение message_debug_data)
// ============================

interface MemoryLayersDebug {
  longTerm: {
    language: Language;
    dialogStyle: DialogStyle;
    responseLength: ResponseLength;
    customPromptLength: number | null; // длина custom_prompt в символах
  };
  working: {
    taskId: string | null;
    taskTitle: string | null;
    taskDescriptionLength: number | null; // длина description в символах
  };
  shortTerm: {
    strategyType: string;
    factsCount: number;
    messagesInContext: number;
  };
  assembledSystemPromptTokens: number; // токены итогового system prompt
}
```

---

## 3. Endpoints: UserProfile (Long-term Memory)

Профиль -- singleton-ресурс (один на пользователя). Пользователь определяется из JWT, поэтому путь не содержит идентификатор.

### GET /api/profile

Получить профиль текущего пользователя. Если профиля нет -- вернуть дефолтный (без записи в БД).

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "id": "a1b2c3d4-...",
  "username": "admin",
  "language": "auto",
  "dialogStyle": "friendly",
  "responseLength": "not_set",
  "customPrompt": null,
  "updatedAt": "2026-03-31T10:00:00.000Z"
}
```

Если профиля в БД нет, вернуть:
```json
{
  "id": null,
  "username": "admin",
  "language": "auto",
  "dialogStyle": "friendly",
  "responseLength": "not_set",
  "customPrompt": null,
  "updatedAt": null
}
```

**Обоснование:** Возвращаем дефолтные значения без 404 -- фронтенд всегда получает рабочий объект, форма профиля просто показывает текущие настройки. Нет необходимости в POST-создании.

---

### PUT /api/profile

Создать или обновить профиль (upsert по username из JWT).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```typescript
interface UpdateProfileDto {
  language?: Language;       // default: 'auto'
  dialogStyle?: DialogStyle; // default: 'friendly'
  responseLength?: ResponseLength; // default: 'not_set'
  customPrompt?: string | null;    // max 4000 chars
}
```

```json
{
  "language": "ru",
  "dialogStyle": "technical",
  "responseLength": "detailed",
  "customPrompt": "Always provide code examples in TypeScript"
}
```

**Response 200:**
```json
{
  "id": "a1b2c3d4-...",
  "username": "admin",
  "language": "ru",
  "dialogStyle": "technical",
  "responseLength": "detailed",
  "customPrompt": "Always provide code examples in TypeScript",
  "updatedAt": "2026-03-31T10:05:00.000Z"
}
```

**Response 400 (validation):**
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["language must be one of: ru, en, auto"]
}
```

**SQL:**
```sql
INSERT INTO user_profiles (id, username, language, dialog_style, response_length, custom_prompt)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (username) DO UPDATE SET
  language = COALESCE($3, user_profiles.language),
  dialog_style = COALESCE($4, user_profiles.dialog_style),
  response_length = COALESCE($5, user_profiles.response_length),
  custom_prompt = $6,
  updated_at = NOW()
RETURNING *;
```

---

## 4. Endpoints: Tasks (Working Memory)

Задачи привязаны к username из JWT. Ресурс вложенности нет -- tasks самостоятельный ресурс верхнего уровня.

### POST /api/tasks

Создать задачу.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```typescript
interface CreateTaskDto {
  title: string;          // required, max 200
  description?: string;   // optional, max 10000
}
```

```json
{
  "title": "Implement 3-level memory",
  "description": "Add long-term user profile, working memory via tasks, and keep existing short-term conversation context."
}
```

**Response 201:**
```json
{
  "id": "f5e6d7c8-...",
  "username": "admin",
  "title": "Implement 3-level memory",
  "description": "Add long-term user profile...",
  "isArchived": false,
  "conversationCount": 0,
  "createdAt": "2026-03-31T10:10:00.000Z",
  "updatedAt": "2026-03-31T10:10:00.000Z"
}
```

---

### GET /api/tasks

Список задач текущего пользователя.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
| Param       | Type    | Default | Description                   |
|-------------|---------|---------|-------------------------------|
| limit       | number  | 20      | 1-100                         |
| offset      | number  | 0       | Для пагинации                 |
| archived    | boolean | false   | Показывать архивные           |

**Response 200:**
```json
{
  "items": [
    {
      "id": "f5e6d7c8-...",
      "title": "Implement 3-level memory",
      "description": "Add long-term user profile...",
      "isArchived": false,
      "conversationCount": 3,
      "createdAt": "2026-03-31T10:10:00.000Z",
      "updatedAt": "2026-03-31T12:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

**SQL:**
```sql
SELECT t.*,
  (SELECT COUNT(*) FROM conversations c WHERE c.task_id = t.id) AS conversation_count
FROM tasks t
WHERE t.username = $1 AND t.is_archived = $2
ORDER BY t.updated_at DESC
LIMIT $3 OFFSET $4;

SELECT COUNT(*) FROM tasks WHERE username = $1 AND is_archived = $2;
```

---

### GET /api/tasks/:id

Детальная информация о задаче со списком привязанных диалогов.

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "id": "f5e6d7c8-...",
  "username": "admin",
  "title": "Implement 3-level memory",
  "description": "Add long-term user profile...",
  "isArchived": false,
  "conversationCount": 2,
  "createdAt": "2026-03-31T10:10:00.000Z",
  "updatedAt": "2026-03-31T12:00:00.000Z",
  "conversations": [
    {
      "id": "aaa-...",
      "title": "API design discussion",
      "model": "gpt-4o-mini",
      "contextStrategy": "sticky_facts",
      "messageCount": 14,
      "createdAt": "2026-03-31T10:15:00.000Z",
      "updatedAt": "2026-03-31T11:30:00.000Z"
    }
  ]
}
```

**Response 404:**
```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Task not found"
}
```

---

### PATCH /api/tasks/:id

Обновить задачу (title, description, isArchived).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```typescript
interface UpdateTaskDto {
  title?: string;        // max 200
  description?: string;  // max 10000
  isArchived?: boolean;
}
```

```json
{
  "title": "Implement 3-level memory (v2)",
  "isArchived": false
}
```

**Response 200:** Возвращает обновленную задачу (тот же формат, что GET /api/tasks/:id, но без conversations).

**Response 404:** Task not found.

---

### DELETE /api/tasks/:id

Удалить задачу. Привязанные диалоги НЕ удаляются -- у них task_id становится NULL (ON DELETE SET NULL).

**Headers:** `Authorization: Bearer <token>`

**Response 204:** No Content.

**Response 404:** Task not found.

---

### POST /api/tasks/:id/conversations

Создать диалог, привязанный к задаче. Тело запроса идентично POST /api/conversations, но task_id проставляется автоматически.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```typescript
interface CreateTaskConversationDto {
  title?: string;
  model?: string;
  systemPrompt?: string;
  contextStrategy?: 'sliding_window' | 'sticky_facts' | 'branching';
}
```

**Response 201:** Стандартный объект Conversation с добавленным полем `taskId`.

**Обоснование:** Отдельный эндпоинт вместо добавления taskId в POST /conversations -- RESTful вложенность, серверная валидация принадлежности task пользователю, невозможность привязать чужую задачу.

---

## 5. Изменения существующих эндпоинтов

### PATCH /api/conversations/:id -- добавить taskId

Разрешить привязку/отвязку диалога от задачи.

**Добавить в UpdateConversationDto:**
```typescript
interface UpdateConversationDto {
  // ... existing fields ...
  taskId?: string | null; // UUID задачи или null для отвязки
}
```

```json
{
  "taskId": "f5e6d7c8-..."
}
```

Валидация: если taskId передан (не null), проверить что задача существует и принадлежит пользователю. Иначе 400.

---

### GET /api/conversations -- добавить taskId в ответ

```json
{
  "id": "aaa-...",
  "title": "...",
  "taskId": "f5e6d7c8-...",
  "taskTitle": "Implement 3-level memory",
  ...
}
```

Добавить JOIN на tasks для получения taskTitle. Если task_id IS NULL, оба поля null.

---

### GET /api/conversations -- добавить фильтр по задаче

| Param  | Type   | Description                              |
|--------|--------|------------------------------------------|
| taskId | string | Фильтр по задаче (UUID или "none")       |

`?taskId=f5e6d7c8-...` -- диалоги этой задачи.
`?taskId=none` -- диалоги без задачи (task_id IS NULL).
Без параметра -- все диалоги (текущее поведение).

---

### POST /api/chat/message -- без изменений в request

**task_id НЕ нужен в запросе.** Бэкенд определяет task_id из conversation:

```
conversation = getConversation(conversationId)
taskId = conversation.task_id
if (taskId) task = getTask(taskId) // получить description для working memory
```

Это ключевое решение: клиент не должен знать/передавать task_id при отправке сообщения. Источник истины -- связь conversation -> task в БД.

---

### POST /api/chat/message -- расширение response (debug)

В существующий `strategyMetadata` добавить блок `memoryLayers`:

```json
{
  "reply": "...",
  "usage": { ... },
  "appliedParams": { ... },
  "cost": 0.0012,
  "strategyMetadata": {
    "memoryLayers": {
      "longTerm": {
        "language": "ru",
        "dialogStyle": "technical",
        "responseLength": "detailed",
        "customPromptLength": 45
      },
      "working": {
        "taskId": "f5e6d7c8-...",
        "taskTitle": "Implement 3-level memory",
        "taskDescriptionLength": 120
      },
      "shortTerm": {
        "strategyType": "sticky_facts",
        "factsCount": 5,
        "messagesInContext": 12
      },
      "assembledSystemPromptTokens": 340
    }
  }
}
```

Также расширить `message_debug_data.strategy_metadata` (JSONB) -- сохранять `memoryLayers` для каждого сообщения, чтобы debug-панель на фронте могла отобразить слои.

---

## 6. Сборка System Prompt из 3 уровней

Порядок конкатенации (сверху вниз по приоритету):

```
[1. Long-term: UserProfile]
  - dialog_style -> инструкция стиля
  - response_length -> инструкция объема
  - language -> инструкция языка
  - custom_prompt -> пользовательский промпт

[2. Working: Task description]
  - task.description (если conversation привязан к task)

[3. Short-term: Conversation system_prompt]
  - conversation.system_prompt (если задан пользователем при создании)
```

**Принцип:** более конкретный контекст идет ниже и может уточнять/переопределять общий. Если поле пустое -- блок пропускается.

**Пример собранного system prompt:**

```
You are a helpful assistant.
Communication style: technical and precise.
Response length: provide detailed explanations with examples.
Language: respond in Russian.
Always provide code examples in TypeScript.

---
Current task: Implement 3-level memory
Add long-term user profile, working memory via tasks, and keep existing short-term conversation context.

---
You are a senior API designer specializing in REST design patterns.
```

**Реализация (pseudocode):**

```typescript
function assembleSystemPrompt(
  profile: UserProfile | null,
  task: Task | null,
  conversationSystemPrompt: string | null,
): string {
  const parts: string[] = [];

  // Layer 1: Long-term (UserProfile)
  if (profile) {
    const profileParts: string[] = [];

    if (profile.dialogStyle !== 'friendly') { // friendly is default, skip
      const styleMap = {
        formal: 'Use formal, professional tone.',
        technical: 'Communication style: technical and precise.',
        creative: 'Be creative and expressive in responses.',
      };
      profileParts.push(styleMap[profile.dialogStyle]);
    }

    if (profile.responseLength !== 'not_set') {
      const lengthMap = {
        brief: 'Keep responses concise and to the point.',
        detailed: 'Provide detailed explanations with examples.',
      };
      profileParts.push(lengthMap[profile.responseLength]);
    }

    if (profile.language !== 'auto') {
      const langMap = { ru: 'Russian', en: 'English' };
      profileParts.push(`Language: respond in ${langMap[profile.language]}.`);
    }

    if (profile.customPrompt) {
      profileParts.push(profile.customPrompt);
    }

    if (profileParts.length > 0) {
      parts.push(profileParts.join('\n'));
    }
  }

  // Layer 2: Working memory (Task)
  if (task?.description) {
    parts.push(`Current task: ${task.title}\n${task.description}`);
  }

  // Layer 3: Short-term (Conversation system prompt)
  if (conversationSystemPrompt) {
    parts.push(conversationSystemPrompt);
  }

  return parts.join('\n\n---\n\n');
}
```

---

## 7. NestJS Module Structure

```
src/
  profile/
    profile.module.ts
    profile.controller.ts      # GET /profile, PUT /profile
    profile.service.ts         # getOrDefault(), upsert()
    dto/
      update-profile.dto.ts

  task/
    task.module.ts
    task.controller.ts         # CRUD /tasks, POST /tasks/:id/conversations
    task.service.ts            # create, findAll, findOne, update, delete
    dto/
      create-task.dto.ts
      update-task.dto.ts
```

Новые модули импортируются в `app.module.ts`. `TaskModule` импортирует `ConversationModule` (для создания диалогов внутри задачи). `ChatModule` импортирует `ProfileModule` и `TaskModule` (для сборки system prompt).

---

## 8. Миграции

```typescript
// В database.service.ts -> getMigrations()

{
  name: '010_create_user_profiles',
  sql: `
    CREATE TABLE IF NOT EXISTS user_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(100) NOT NULL UNIQUE,
      language VARCHAR(10) NOT NULL DEFAULT 'auto'
        CHECK (language IN ('ru', 'en', 'auto')),
      dialog_style VARCHAR(20) NOT NULL DEFAULT 'friendly'
        CHECK (dialog_style IN ('formal', 'friendly', 'technical', 'creative')),
      response_length VARCHAR(20) NOT NULL DEFAULT 'not_set'
        CHECK (response_length IN ('brief', 'detailed', 'not_set')),
      custom_prompt TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
},
{
  name: '011_create_tasks',
  sql: `
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(100) NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_tasks_username ON tasks(username);
    CREATE INDEX idx_tasks_username_updated ON tasks(username, updated_at DESC);
  `,
},
{
  name: '012_conversations_add_task_id',
  sql: `
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_conversations_task_id ON conversations(task_id);
  `,
},
```

---

## 9. Идемпотентность и безопасность

| Endpoint                        | Method | Idempotent | Notes                                  |
|---------------------------------|--------|------------|----------------------------------------|
| GET /profile                    | GET    | Yes        | Чтение                                 |
| PUT /profile                    | PUT    | Yes        | Upsert -- повторный вызов с теми же данными дает тот же результат |
| POST /tasks                     | POST   | No         | Создание -- каждый вызов создает новую задачу |
| GET /tasks                      | GET    | Yes        | Чтение                                 |
| GET /tasks/:id                  | GET    | Yes        | Чтение                                 |
| PATCH /tasks/:id                | PATCH  | Yes        | Частичное обновление                   |
| DELETE /tasks/:id               | DELETE | Yes        | Повторное удаление -- 404, но без побочных эффектов |
| POST /tasks/:id/conversations   | POST   | No         | Создание диалога                       |

---

## 10. Backward Compatibility

Все изменения обратно совместимы:

1. **conversations.task_id** -- nullable, существующие диалоги получают NULL
2. **GET /conversations** -- taskId/taskTitle в ответе добавляются как новые поля (null для старых диалогов)
3. **POST /chat/message** -- request body не меняется; memoryLayers добавляется в strategyMetadata (новое вложенное поле)
4. **UserProfile** -- при отсутствии записи используются дефолтные значения; system prompt собирается из того что есть
5. Фильтр `?taskId=` -- опциональный query param, без него поведение прежнее

Клиенты, не знающие о memory layers, продолжают работать без изменений.

---

## 11. Rate Limits

Новые эндпоинты наследуют глобальный throttler из app.module.ts. Специальных лимитов не требуется -- profile и tasks это CRUD с низкой нагрузкой.

| Endpoint group | Limit          |
|----------------|----------------|
| /profile       | Global default |
| /tasks         | Global default |
| /chat/message  | 20/min (existing) |
