# Research: Режим тестирования контекстных стратегий (Frontend)

Дата: 2026-03-29
Роль: Frontend-эксперт (React Specialist)

---

## 1. Анализ текущей архитектуры

### Ключевые файлы и их роли

| Файл | Строк | Роль |
|---|---|---|
| `chat-layout.tsx` | 295 | Оркестратор: sidebar, chat area, params drawer, facts/branches panels |
| `use-chat.ts` | 260 | Хук: messages[], send(), loadConversation(), contextWindow |
| `use-ai-params.ts` | 98 | Хук: AIParams в localStorage, setParam, resetParams |
| `ai-params-panel.tsx` | 274 | Drawer справа: модель, температура, стратегия, консилиум |
| `message-bubble.tsx` | 118 | Пузырь сообщения: user/assistant, expert opinions accordion |
| `applied-params-display.tsx` | 104 | Мета-строка: model, temp, tokens, cost, duration, ctx% |
| `context-indicator.tsx` | 72 | Горизонтальная полоска использования контекста |
| `chat-input.tsx` | 82 | Textarea + кнопка отправки + toggle params |
| `strategy-selector.tsx` | 48 | Сегментированный переключатель 3 стратегий |

### Паттерны в кодовой базе

- **Состояние** — через React hooks (`useState`, `useCallback`, `useRef`), без глобального стора
- **Персистентность** — `localStorage` для AIParams
- **Layout** — flex-based, sidebar слева (collapsible на mobile), drawer справа (fixed overlay)
- **Стиль** — Tailwind CSS, цветовая схема: `indigo-600` accent, `gray-*` neutrals
- **Компонентная архитектура** — плоская, все chat-компоненты в `components/chat/`
- **API** — через `apiRequest()` в `lib/api.ts`, REST, JWT auto-refresh

---

## 2. Где разместить переключатель "Тест-режим"

### Рекомендация: Вкладки в header чата

**Место**: Header строка (`h-14 border-b`) в `chat-layout.tsx`, строка 147.

Сейчас header содержит: [burger menu] [logo] [ChatGPT App] ... [username] [Выйти].

**Предложение**: Добавить сегментированный переключатель (по аналогии с `strategy-selector.tsx`) между логотипом и правой частью header:

```
[burger] [logo] ChatGPT App   [ Чат | Тестирование ]   [username] [Выйти]
```

**Обоснование**:
- Тест-режим — это режим работы приложения, а не параметр AI. Поэтому размещать его в params drawer некорректно
- Header — единственное место, видимое всегда, независимо от состояния sidebar/drawer
- Паттерн сегментированных кнопок уже есть в кодовой базе (`strategy-selector.tsx`)
- Переключение режима должно быть явным и заметным, не спрятанным

**Альтернатива (отвергнута)**: Кнопка в sidebar рядом с "Новый диалог". Проблема — sidebar скрыт на мобильных, и семантически тест-режим не привязан к конкретному диалогу.

**Иконка**: `FlaskConical` или `TestTube2` из lucide-react.

### Поведение переключения

- При переходе в тест-режим: текущий чат остается (не теряется), но основная область заменяется на форму тестирования
- При переходе обратно: возврат к текущему чату
- Sidebar остается видимым — тестовые диалоги сохраняются как обычные conversations и видны в списке
- Params drawer остается доступным — все настройки AI работают и в тест-режиме

---

## 3. Форма настроек теста

### Новый компонент: `TestModePanel`

Размещение: вместо `EmptyState` / зоны сообщений, когда активен тест-режим.

**Макет формы**:

```
+--------------------------------------------------+
|  Тестирование контекстных стратегий               |
|                                                    |
|  Тема диалога                                     |
|  [ textarea: "Обсуждение квантовой физики..." ]   |
|                                                    |
|  Длина диалога                                    |
|  [=====O=============] 15 пар                     |
|  5                 50                              |
|                                                    |
|  Стратегия: [Окно | Факты | Ветки] <-- из params  |
|  Модель: gpt-4o-mini           <-- из params       |
|                                                    |
|  [ Сгенерировать диалог ]                         |
+--------------------------------------------------+
```

**Поля**:
1. **Тема диалога** — `textarea`, обязательное, placeholder "Опишите тему для генерируемого диалога..."
2. **Длина** — `input[type=range]`, min=5, max=50, step=1, default=10. По аналогии со слайдерами в `ai-params-panel.tsx`
3. **Стратегия и модель** — НЕ дублировать. Показывать readonly-ссылку на текущие параметры из `useAIParams`. Кнопка "Открыть настройки" для перехода к params drawer

**Кнопка "Сгенерировать"** — primary (`bg-indigo-600`), disabled если тема пустая или генерация идет.

### Состояние формы

Новый хук `use-test-mode.ts`:
- `isTestMode: boolean` — переключатель режима
- `testConfig: { topic: string; pairCount: number }` — параметры формы
- `generationState: 'idle' | 'generating' | 'done' | 'error'`
- `generationProgress: { current: number; total: number }` — прогресс
- `startGeneration(topic, pairCount, params): Promise<void>` — запуск
- `cancelGeneration(): void` — отмена (если backend поддержит)

---

## 4. Отображение прогресса генерации

### Во время генерации

После нажатия "Сгенерировать" форма заменяется на область сообщений, где сообщения появляются по одному по мере генерации.

**Вариант A (рекомендуемый): Polling / SSE**

Backend возвращает диалог пошагово. Фронтенд получает пары и добавляет их в messages[]:

```
Генерация: 3/10 пар
[user] Расскажите о квантовой запутанности...
[assistant] Квантовая запутанность — это...
[user] А как это связано с телепортацией?
[assistant] Квантовая телепортация...
[user] ...
[typing indicator]
```

Прогресс-бар в верхней части:
```
[=========>          ] 3/10 пар  |  Генерация...  [Отмена]
```

**Вариант B: Single request**

Backend генерирует все N пар за один запрос. Фронтенд показывает:
```
[=====      ] 5/10 пар
Генерация диалога на тему "Квантовая физика"...
```

Недостаток: нет промежуточного результата, длительное ожидание.

**Рекомендация**: Вариант A предпочтительнее для UX. Но требует SSE или polling на backend. Минимальный вариант — polling endpoint `GET /chat/test-generation/:id/status` каждые 2-3 секунды.

### Компонент прогресса: `TestGenerationProgress`

Размещается вместо `ContextIndicator` или под ним на время генерации.

```
+-----------------------------------------------------------------+
| [====>                ] 4/10 пар | gpt-4o-mini | sliding_window |
|                                                        [Отмена] |
+-----------------------------------------------------------------+
```

---

## 5. Debug-компоненты

### Новый компонент: `StrategyDebugInfo`

Размещается ВНУТРИ `MessageBubble` под `AppliedParamsDisplay`, видим только в тест-режиме (или по toggle).

**Для sliding_window**:
```
[debug] window: 8/10 msgs | trimmed: 12 msgs, ~4.2K tok | summary: 856 tok
        tokens: prompt 3241 (system:120 history:2800 msg:321) -> completion 580
```

**Для sticky_facts**:
```
[debug] facts in ctx: 5 (user_name, language, ...) | +2 new | ~1 updated
        last msgs: 6/10 | fact tokens: 342 | history tokens: 1890
```

**Для branching**:
```
[debug] branch: "Branch 2" | parent: main | checkpoint: msg#7
        branch msgs: 4 | total ctx: 2.1K tok
```

**Общий блок (всегда)**:
```
tokens: 3241 total (prompt:2661 completion:580) | cost: $0.0012 | 1.8s
context: 12.4K/128K (9.7%) | strategy: sliding_window
```

### Как показывать

1. **Toggle на уровне сообщения** — кнопка `Bug`/`Code` иконка, показывается on hover (аналогично кнопке "Создать ветку")
2. **Global toggle** — в header тест-режима: "Показать debug" checkbox. Включает debug для всех сообщений разом
3. **Раскрываемый блок** — `ChevronDown/ChevronRight` accordion, аналогично `ExpertOpinionsAccordion`

**Рекомендация**: Комбинация (2) + (3). Global toggle в header включает/выключает debug-блоки, каждый блок свернут по умолчанию, можно развернуть.

### Данные для debug

Текущий `Message` interface уже содержит:
- `usage` (promptTokens, completionTokens, currentMessageTokens, historyTokens)
- `truncation` (droppedMessages, droppedTokens)
- `contextUsedTokens`, `contextMaxTokens`
- `cost`, `durationMs`
- `appliedParams`

**Нужно добавить от backend** (новые поля в ответе):
- `strategyDebug: object` — специфичная для стратегии debug-информация:
  - sliding_window: `{ windowSize, keptMessages, trimmedMessages, trimmedTokens, summaryTokens, summaryPresent }`
  - sticky_facts: `{ factsInContext: string[], factsAdded: string[], factsUpdated: string[], factTokens, historyMessages, historyTokens }`
  - branching: `{ branchName, branchId, parentBranch, checkpointMessageId, branchMessageCount }`

Тип на фронте:
```typescript
interface StrategyDebug {
  strategy: ContextStrategyType;
  // sliding_window
  windowSize?: number;
  keptMessages?: number;
  trimmedMessages?: number;
  trimmedTokens?: number;
  summaryTokens?: number;
  summaryPresent?: boolean;
  // sticky_facts
  factsInContext?: string[];
  factsAdded?: string[];
  factsUpdated?: string[];
  factTokens?: number;
  // branching
  branchName?: string;
  branchId?: string;
  parentBranch?: string;
  checkpointMessageId?: string;
  branchMessageCount?: number;
  // common
  totalPromptTokens?: number;
  systemPromptTokens?: number;
  historyTokens?: number;
  currentMessageTokens?: number;
}
```

---

## 6. Переключение между обычным и тестовым режимами

### Принцип: тестовый диалог = обычный диалог с флагом

Тестовый диалог после генерации ничем не отличается от обычного, кроме:
1. В `conversations` таблице — флаг `is_test: true` (или `mode: 'test'`)
2. Каждое сообщение хранит расширенный `strategyDebug`
3. В sidebar тестовые диалоги помечены иконкой (FlaskConical)

### Поток переключения

```
Обычный режим                     Тест-режим
+-----------+                     +-----------+
| sidebar   |                     | sidebar   |  (тот же)
| messages  |  --[вкладка]-->     | test form |
| input     |                     | или msgs  |
+-----------+                     +-----------+
                                       |
                                  [Сгенерировать]
                                       |
                                  messages + debug
                                       |
                                  [input] (ручное продолжение)
```

**Состояния тест-режима**:
1. **Форма** — пустой тест, выбор темы и длины
2. **Генерация** — прогресс-бар, сообщения появляются
3. **Результат** — полный диалог с debug, можно продолжить вручную
4. **Продолжение** — обычный chat-input, отправка добавляет сообщения в тот же conversation

При переключении в состояние (4) по сути это уже обычный чат, разница только в наличии debug-информации.

---

## 7. Перечень новых файлов и изменений

### Новые файлы

| Файл | Назначение |
|---|---|
| `hooks/use-test-mode.ts` | Хук: состояние теста, прогресс, запуск генерации |
| `components/chat/test-mode-form.tsx` | Форма: тема, длина, кнопка генерации |
| `components/chat/test-generation-progress.tsx` | Прогресс-бар генерации |
| `components/chat/strategy-debug-info.tsx` | Debug-блок на сообщении |
| `components/chat/mode-switcher.tsx` | Переключатель Чат/Тестирование в header |

### Изменения в существующих файлах

| Файл | Изменение |
|---|---|
| `chat-layout.tsx` | Добавить mode switcher в header, условный рендер test form / chat, передача debug toggle |
| `message-bubble.tsx` | Добавить проп `strategyDebug` и рендер `StrategyDebugInfo` |
| `use-chat.ts` | Расширить `Message` interface полем `strategyDebug`, парсить из API response |
| `types/ai-params.ts` | Добавить `StrategyDebug` interface |
| `types/conversation.ts` | Расширить `ConversationMessage` полями debug |
| `lib/api.ts` | Добавить `generateTestDialog()` API function |

### Не затрагиваемые файлы

- `use-ai-params.ts` — без изменений, params переиспользуются as-is
- `ai-params-panel.tsx` — без изменений
- `context-indicator.tsx` — без изменений
- `applied-params-display.tsx` — без изменений (debug отдельно)
- `strategy-selector.tsx` — без изменений
- `chat-input.tsx` — без изменений

---

## 8. Зависимости от backend

Для реализации фронтенда потребуются следующие API endpoints:

1. **POST /chat/test-generate** — запуск генерации тестового диалога
   - Body: `{ topic, pairCount, params (model, temperature, strategy, ...) }`
   - Response: `{ generationId, conversationId }`

2. **GET /chat/test-generate/:id/status** — прогресс генерации (polling)
   - Response: `{ status: 'generating'|'done'|'error', progress: { current, total }, conversationId }`

   ИЛИ **SSE endpoint** для streaming прогресса (предпочтительнее).

3. Расширение ответа **POST /chat/message** — поле `strategyDebug` с debug-информацией по стратегии.

---

## 9. Риски и вопросы

1. **Генерация 50 пар** может занять 2-5 минут. Нужен механизм отмены и timeout
2. **Стоимость**: 50 пар GPT-4o может стоить $1-5. Показывать estimated cost перед генерацией
3. **Backend polling vs SSE**: SSE предпочтительнее, но текущая архитектура (NestJS REST) не использует SSE. Добавление SSE — дополнительная работа. Polling проще, но менее отзывчив
4. **Хранение debug-данных**: strategyDebug нужно сохранять в таблице messages. Это увеличит размер записи. Вариант: отдельная таблица `message_debug` с JSON-полем
5. **Мобильная адаптация**: Header уже тесный на mobile (burger + logo + username + logout). Mode switcher может не влезть. Решение: на mobile показывать переключатель под header или в sidebar
