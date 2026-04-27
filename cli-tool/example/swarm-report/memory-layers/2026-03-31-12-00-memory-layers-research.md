# Research: 3-уровневая память

Дата: 2026-03-31

## Сводка консилиума

### Архитектор (code-reviewer)

**Новые таблицы:**
```sql
tasks (id UUID, username, title, description TEXT, status, created_at, updated_at)
user_profiles (id UUID, username UNIQUE, response_language, dialogue_style, custom_prompt, preferences JSONB, created_at, updated_at)
ALTER TABLE conversations ADD COLUMN task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE message_debug_data ADD COLUMN memory_layers JSONB;
```

**Ключевое архитектурное решение:** Новый `MemoryAssemblerService` запускается ДО стратегий контекста. Собирает системный промпт: long-term → working → short-term. Стратегии (sliding-window, sticky-facts, branching) НЕ меняются — они продолжают получать готовый `systemPrompt` строкой.

**Расширяемость:** Единственная точка сборки — `MemoryAssemblerService.assemble()`. Добавить 4-й уровень = добавить блок в один метод + новый сервис.

---

### Фронтенд-эксперт (react-specialist)

**Новые хуки:** `use-tasks.ts`, `use-personalization.ts`

**Новые компоненты:** `personalization-panel.tsx`, `task-form-modal.tsx`, `task-group.tsx`

**Измененные компоненты:**
- `conversation-sidebar.tsx` — группировка задача→диалоги (accordion)
- `ai-params-panel.tsx` — вкладки Параметры / Персонализация
- `debug-panel.tsx` — секция слоёв памяти
- `chat-layout.tsx` — подключение новых хуков

**Хранение персонализации:** ТОЛЬКО сервер (GET при маунте, debounced PUT при изменении). Не localStorage.

---

### UI-дизайнер

**Цветовое кодирование уровней памяти:**
- long-term: `bg-purple-100 text-purple-700` + иконка `Brain`
- working: `bg-amber-100 text-amber-700` + иконка `ClipboardList`
- short-term: `bg-sky-100 text-sky-700` + иконка `MessageCircle`

**Персонализация:** Две вкладки в правом drawer (`Параметры` / `Персонализация`). Стиль диалога — grid 2x2 (4 варианта не умещаются в сегмент). Язык и краткость — классические 3-сегментные переключатели.

**Задачи в сайдбаре:** Accordion с indent. Inline-форма создания прямо в сайдбаре. Бейдж активной задачи в header чата.

---

### API-дизайнер

**Новые эндпоинты:**
- `GET/PUT /api/profile` — singleton профиль пользователя (долговременная память)
- `POST/GET /api/tasks` — CRUD задач
- `GET/PATCH/DELETE /api/tasks/:id`
- `POST /api/tasks/:id/conversations` — создать диалог в задаче

**Ключевое решение:** `task_id` НЕ передаётся в `/chat/message`. Бэкенд сам определяет через `conversation.task_id`. Исключает рассинхронизацию.

**Сборка системного промпта:**
```
[User preferences] (long-term)
---
[Task context] (working)
---
[conversation.system_prompt] (short-term)
```

---

## Архитектурные решения

| Вопрос | Решение |
|--------|---------|
| Где собирать память | `MemoryAssemblerService` ДО стратегий |
| task_id в chat/message | НЕТ — бэкенд берёт из conversation |
| Персонализация на фронте | Только сервер, не localStorage |
| Debug debug_data | Колонка `memory_layers JSONB` |
| Стратегии | НЕ меняются |
