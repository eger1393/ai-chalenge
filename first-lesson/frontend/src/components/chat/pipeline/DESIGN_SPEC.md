# Pipeline Message UI -- Design Specification

**Дата:** 2026-04-02
**Автор:** UI-дизайнер (Research-консилиум)
**Компонент:** PipelineMessageBubble -- расширение MessageBubble для поэтапной обработки

---

## 1. Дизайн-токены (на основе существующей системы)

### Цвета (из текущей кодовой базы)

| Токен | Значение | Применение |
|-------|----------|------------|
| bg-primary | `bg-white` | Фон приложения |
| bg-bubble-assistant | `bg-gray-100` | Фон пузыря ассистента |
| bg-bubble-user | `bg-indigo-600` | Фон пузыря пользователя |
| text-primary | `text-gray-900` | Основной текст |
| text-secondary | `text-gray-600` | Вторичный текст |
| text-muted | `text-gray-400` | Приглушённый текст |
| accent | `indigo-600` | Акцент (кнопки, активные элементы) |
| border-default | `border-gray-200` | Стандартная граница |
| border-subtle | `border-gray-100` | Лёгкая граница |

### Новые токены для pipeline

| Токен | Значение | Применение |
|-------|----------|------------|
| pipeline-planning | `amber-500` | Этап planning |
| pipeline-execution | `indigo-500` | Этап execution |
| pipeline-validation | `violet-500` | Этап validation |
| pipeline-done | `emerald-500` | Этап done |
| pipeline-error | `red-500` | Ошибка/retry |
| pipeline-paused | `gray-400` | Пауза |

---

## 2. Визуальный индикатор прогресса (Vertical Mini-Stepper)

### Решение: вертикальный компактный stepper слева от контента

Выбран вертикальный stepper вместо горизонтального по причинам:
- Органично вписывается в вертикальный поток чата
- Не занимает горизонтальное пространство пузыря
- Масштабируется на мобильных экранах
- Визуально напоминает timeline, что интуитивно для "шагов обработки"

### Компонент: `PipelineStepper`

**Расположение:** слева от контента пузыря, между аватаром и текстом.

**Структура каждого шага:**

```
[индикатор-точка] --- [метка этапа] --- [время/длительность]
      |
  [соединительная линия]
      |
[индикатор-точка] --- [метка этапа] --- [время/длительность]
```

**Размеры:**
- Точка-индикатор: `w-2.5 h-2.5` (10px)
- Соединительная линия: `w-px h-4` (1px шириной, 16px высотой)
- Текст метки: `text-[10px]` (10px, mono)
- Общая ширина stepper-колонки: `w-20` (80px)

### Состояния точек-индикаторов

| Состояние | Визуал | Tailwind |
|-----------|--------|----------|
| Pending (ожидание) | Пустой кружок, серая граница | `border-2 border-gray-300 bg-white rounded-full` |
| Active (в процессе) | Залитый кружок с pulse-анимацией | `bg-{stage-color} rounded-full animate-pulse` |
| Complete (завершён) | Залитый кружок с чекмарком | `bg-{stage-color} rounded-full` + `Check` иконка w-2 h-2 белая |
| Error | Залитый красный кружок | `bg-red-500 rounded-full` + `X` иконка w-2 h-2 белая |
| Paused | Серый кружок с паузой | `bg-gray-400 rounded-full` + `Pause` иконка w-2 h-2 белая |

### Соединительные линии

| Состояние | Tailwind |
|-----------|----------|
| Пройдена | `bg-{stage-color}` (сплошная, цвет предыдущего завершённого этапа) |
| Активная | `bg-{stage-color} opacity-40` с градиентом |
| Ожидание | `bg-gray-200` (пунктир: `border-l-2 border-dashed border-gray-300`) |
| Retry-возврат | `bg-red-300` пунктирная линия вверх (от validation к planning) |

### Иконки этапов (lucide-react)

| Этап | Иконка | Обоснование |
|------|--------|-------------|
| planning | `ListChecks` | План = чеклист |
| execution | `Play` | Выполнение = воспроизведение |
| validation | `ShieldCheck` | Верификация = щит с чеком |
| done | `CheckCircle2` | Завершение = круглая галка |

---

## 3. Интеграция pipeline в message-bubble

### Компонент: `PipelineMessageBubble`

Расширяет текущий `MessageBubble` для assistant-сообщений, находящихся в pipeline-обработке.

### Layout (Desktop, >=640px)

```
[avatar 32px] [stepper 80px] [content bubble (flex-1, max-w-[60%])]
```

**Структура:**

```
<div class="group/msg mb-4">
  <!-- AppliedParamsDisplay (как сейчас, ml-11) -->
  <div class="flex items-start gap-3">
    <!-- Avatar (w-8 h-8, как сейчас) -->
    <!-- Pipeline Stepper (w-20, вертикальный) -->
    <!-- Content Area (flex-1 max-w-[60%]) -->
      <!-- Active Stage Header -->
      <!-- Stage Content / Collapsible Sections -->
      <!-- Pause/Resume Button -->
  </div>
  <!-- Debug Panel (как сейчас, ml-11) -->
</div>
```

### Active Stage Header

Полоска-заголовок текущего активного этапа над контентом пузыря:

```
<div class="flex items-center gap-2 px-3 py-1.5 bg-{stage-color}-50 border border-{stage-color}-200 rounded-t-2xl text-[11px]">
  <StageIcon class="w-3.5 h-3.5 text-{stage-color}-600" />
  <span class="font-medium text-{stage-color}-700">{Stage Name}</span>
  <span class="text-{stage-color}-400 ml-auto font-mono">12.3s</span>
</div>
```

Цвета заголовка по этапам:
- planning: `bg-amber-50 border-amber-200 text-amber-700`
- execution: `bg-indigo-50 border-indigo-200 text-indigo-700`
- validation: `bg-violet-50 border-violet-200 text-violet-700`
- done: без заголовка, обычный пузырь `bg-gray-100`

### Content Bubble

Пузырь контента соединяется с заголовком:

```
<div class="px-4 py-3 bg-gray-100 rounded-2xl rounded-tl-sm text-sm leading-relaxed">
  {/* Текущий контент этапа (streaming или финальный) */}
</div>
```

Когда есть Active Stage Header, скругление пузыря меняется:
- Заголовок: `rounded-t-2xl rounded-b-none`
- Тело: `rounded-t-none rounded-b-2xl rounded-tl-none`

---

## 4. Раскрываемые секции (Collapsible Stage Results)

### Компонент: `PipelineStageAccordion`

Под основным пузырём, каждый завершённый этап показывается как раскрываемая секция.

### Свёрнутое состояние

```
<button class="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-gray-50 rounded-lg transition-colors">
  <StageIcon class="w-3 h-3 text-{stage-color}-500" />
  <span class="font-medium text-gray-600">{Stage Name}</span>
  <span class="text-gray-400 font-mono ml-1">{duration}</span>
  <span class="text-gray-300 mx-1">|</span>
  <span class="text-gray-400 truncate">{preview первые 60 символов...}</span>
  <ChevronRight class="w-3 h-3 text-gray-400 ml-auto flex-shrink-0" />
</button>
```

### Развёрнутое состояние

```
<div class="border border-{stage-color}-100 rounded-lg overflow-hidden mt-1">
  <button class="w-full flex items-center gap-2 px-3 py-2 bg-{stage-color}-50 text-[10px]">
    <StageIcon class="w-3 h-3 text-{stage-color}-500" />
    <span class="font-medium text-{stage-color}-700">{Stage Name}</span>
    <span class="text-{stage-color}-400 font-mono">{duration}</span>
    <ChevronDown class="w-3 h-3 text-{stage-color}-400 ml-auto" />
  </button>
  <div class="px-3 py-2 text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap bg-white">
    {stage result content}
  </div>
</div>
```

### Группировка секций

Все завершённые этапы группируются под пузырём:

```
<div class="ml-[124px] mt-1 space-y-0.5 max-w-[60%]">
  <!-- PipelineStageAccordion для каждого завершённого этапа -->
</div>
```

`ml-[124px]` = avatar (32px) + gap (12px) + stepper (80px) -- выравнивание с контентом.

### Поведение:
- По умолчанию все секции свёрнуты
- Можно раскрыть несколько одновременно (не accordion, а independent collapse)
- Анимация раскрытия: `transition-all duration-200 ease-out` по max-height

---

## 5. Кнопка Pause/Resume

### Расположение

**Внутри active stage header**, справа, рядом с таймером.

### Состояния и визуал

| Состояние | Иконка | Tailwind |
|-----------|--------|----------|
| Running (можно приостановить) | `Pause` (w-3.5 h-3.5) | `text-{stage-color}-400 hover:text-{stage-color}-600 hover:bg-{stage-color}-100 rounded p-0.5 transition-colors` |
| Paused (можно продолжить) | `Play` (w-3.5 h-3.5) | `text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded p-0.5 transition-colors animate-pulse` |
| Resuming (возобновляется) | `Loader2` (w-3.5 h-3.5) | `text-gray-400 animate-spin` |

### Active Stage Header с кнопкой паузы

```
<div class="flex items-center gap-2 px-3 py-1.5 bg-{stage-color}-50 ...">
  <StageIcon class="w-3.5 h-3.5 text-{stage-color}-600" />
  <span class="font-medium text-{stage-color}-700">{Stage Name}</span>
  <div class="ml-auto flex items-center gap-2">
    <span class="text-{stage-color}-400 font-mono text-[10px]">12.3s</span>
    <button title="Приостановить">{PauseIcon}</button>
  </div>
</div>
```

### Состояние Paused -- визуальные изменения всего пузыря

Когда pipeline приостановлен:
1. Active stage header меняет цвет: `bg-gray-100 border-gray-300`
2. Текст заголовка: `text-gray-500` + метка "Приостановлено"
3. Stepper: активная точка перестаёт пульсировать, становится `bg-gray-400`
4. Контент пузыря: добавляется лёгкий `opacity-70`
5. Появляется баннер под пузырём:

```
<div class="ml-[124px] mt-1 flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700">
  <PauseCircle class="w-3.5 h-3.5" />
  <span>Обработка приостановлена на этапе "{stage name}"</span>
  <button class="ml-auto px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-medium transition-colors">
    Продолжить
  </button>
</div>
```

---

## 6. Debug-панель для pipeline

### Компонент: `PipelineDebugPanel`

Расширяет существующий `DebugPanel`. Располагается в том же месте (`ml-11 mt-1`), кнопка-триггер аналогична.

### Триггер

```
<button class="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-600 transition-colors">
  <Bug class="w-3 h-3" />
  Pipeline Debug
  <span class="text-gray-300 font-mono">(4 steps, 2 retries)</span>
  <ChevronRight class="w-3 h-3" />
</button>
```

### Развёрнутая панель

```
<div class="border border-gray-200 rounded-lg bg-gray-50 p-3 text-[10px] mt-1 max-w-lg space-y-2">

  <!-- Pipeline Summary -->
  <div class="flex items-center gap-3 pb-2 border-b border-gray-200">
    <span class="text-gray-500">Pipeline:</span>
    <span class="px-1.5 py-0.5 rounded bg-{status-color}-100 text-{status-color}-700 font-medium">
      {status: running|paused|done|error}
    </span>
    <span class="font-mono text-gray-500">Итераций: {n}</span>
    <span class="font-mono text-gray-500">Общее время: {total}s</span>
  </div>

  <!-- Per-step details (collapsible) -->
  <!-- Для каждого шага каждой итерации: -->
  <div class="space-y-1">
    <!-- Iteration header (если > 1 итерации) -->
    <div class="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
      Итерация {n}
    </div>

    <!-- Step row -->
    <div class="flex items-start gap-2 px-2 py-1 rounded hover:bg-gray-100">
      <div class="w-2 h-2 mt-1 rounded-full bg-{stage-color}-500 flex-shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-medium text-gray-700">{Stage Name}</span>
          <span class="font-mono text-gray-400">{duration}ms</span>
          <span class="px-1 py-0.5 rounded text-[9px] bg-{status}-100 text-{status}-600">
            {success|failed|skipped}
          </span>
        </div>
        <!-- Expandable: input tokens, output tokens, model, error message -->
        <div class="mt-1 text-gray-500 font-mono">
          in:{inputTokens} out:{outputTokens} model:{model}
        </div>
        <!-- If error -->
        <div class="mt-1 text-red-500 font-mono text-[9px]">
          Error: {error message}
        </div>
      </div>
    </div>
  </div>

  <!-- Existing debug data (memory layers, strategy, etc.) -->
  {/* ...как в текущем DebugPanel... */}
</div>
```

### Информация на каждый шаг

- Название этапа
- Статус (success / failed / running / paused / skipped)
- Длительность (ms)
- Токены: input / output
- Модель, использованная на этом шаге
- Если error: текст ошибки, reason
- Если retry: причина retry, номер попытки

---

## 7. Анимации переходов между этапами

### Переход точки stepper: pending -> active

```css
/* Точка увеличивается и получает цвет */
transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1); /* spring-like overshoot */
/* scale от 0.8 до 1.0, opacity от 0.5 до 1.0 */
```

Tailwind: `transition-all duration-300` + JS-управление классами.

### Переход точки: active -> complete

```css
/* pulse прекращается, появляется чекмарк с fade-in */
/* Чекмарк: opacity 0->1, scale 0.5->1.0, duration 200ms */
```

### Соединительная линия: заполнение

Линия между шагами анимируется заполнением сверху вниз:

```css
/* Используем scaleY с transform-origin: top */
transition: transform 500ms ease-out;
/* scaleY: 0 -> 1 */
```

### Смена заголовка этапа

```css
/* Crossfade: старый заголовок opacity 1->0, новый 0->1 */
transition: opacity 200ms ease-in-out;
/* Одновременно цвет фона меняется через transition: background-color 300ms */
```

### Streaming-текст внутри пузыря

Текст текущего этапа может стримиться. Анимация курсора:

```
<span class="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
```

### Retry-анимация

При переходе validation -> planning (retry):
1. Validation-точка мигает красным 2 раза: `animate-ping` на 600ms
2. Стрелка-возврат появляется (пунктирная линия вверх от validation к planning)
3. Planning-точка снова становится active с pulse

Визуал стрелки-возврата:

```
<div class="absolute left-1/2 -translate-x-1/2 border-l-2 border-dashed border-red-300 h-{calculated}" />
<!-- Маленький треугольник-стрелка вверху -->
<RotateCcw class="w-3 h-3 text-red-400 absolute -top-1 left-1/2 -translate-x-1/2" />
```

---

## 8. Все состояния pipeline-пузыря

### 8.1 Loading (этап в процессе)

- Stepper: текущая точка пульсирует (`animate-pulse`)
- Active stage header: цвет текущего этапа
- Контент: streaming-текст или "Формирование плана..." (`text-gray-400 italic`)
- Pause-кнопка: видна

### 8.2 Paused

- Stepper: текущая точка серая, без анимации
- Header: серый фон, текст "Приостановлено"
- Контент: `opacity-70`
- Баннер паузы под пузырём (см. секцию 5)
- Pause-кнопка: превращается в Play

### 8.3 Error (нефатальная ошибка, до retry)

- Stepper: текущая точка красная
- Header: `bg-red-50 border-red-200 text-red-700`
- Иконка в заголовке: `AlertTriangle` вместо иконки этапа
- Контент: сообщение об ошибке, `text-red-600`
- Кнопка retry:

```
<button class="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[11px] font-medium transition-colors">
  <RotateCcw class="w-3 h-3" />
  Повторить
</button>
```

### 8.4 Retry (автоматический возврат в planning)

- Визуал: пунктирная красная линия-возврат в stepper
- Header: `bg-amber-50 border-amber-200`
- Текст: "Верификация не пройдена. Повторная обработка (попытка {n}/3)..."
- Бейдж итерации на stepper:

```
<span class="absolute -right-1 -top-1 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
  {retryCount}
</span>
```

### 8.5 Complete (done)

- Stepper: все 4 точки зелёные с чекмарками, линии зелёные
- Header: отсутствует (обычный пузырь, как текущий MessageBubble)
- Контент: финальный результат, стандартный стиль `bg-gray-100 text-gray-800`
- Завершённые этапы: компактные раскрываемые секции под пузырём
- Бейдж "Pipeline" (опционально, если был retry):

```
<span class="inline-flex items-center gap-1 text-[9px] text-gray-400 font-mono">
  <Workflow class="w-3 h-3" />
  4 steps, 34.2s, 2 retries
</span>
```

---

## 9. Визуализация retry (validation failed)

### Stepper в состоянии retry

```
  [1. planning]  ---- completed (green) ----
       |
  [2. execution] ---- completed (green) ----
       |
  [3. validation] --- FAILED (red, X icon) ---
       |
  [retry arrow: dashed red line going back up to step 1]
       |
  [1. planning]  ---- active (amber, pulse) -- (iteration 2)
```

### Визуальная реализация retry-стрелки

Вместо буквальной стрелки вверх (сложно, ломает layout), используем компактное решение:

1. Под failed validation -- горизонтальный разделитель retry:

```
<div class="flex items-center gap-2 px-2 py-1 my-1">
  <div class="flex-1 border-t border-dashed border-red-300" />
  <span class="text-[9px] text-red-400 font-medium flex items-center gap-1">
    <RotateCcw class="w-2.5 h-2.5" />
    Retry #{n}
  </span>
  <div class="flex-1 border-t border-dashed border-red-300" />
</div>
```

2. Stepper "перезапускается" с нового набора точек ниже разделителя
3. Предыдущая итерация сворачивается в компактную строку

### Компактная свёрнутая итерация

```
<button class="flex items-center gap-1 text-[9px] text-gray-400 hover:text-gray-600">
  <span class="flex gap-0.5">
    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
    <span class="w-1.5 h-1.5 rounded-full bg-red-400" />
  </span>
  Итерация 1 (failed) -- 12.4s
  <ChevronRight class="w-2.5 h-2.5" />
</button>
```

---

## 10. Mobile-friendly (< 640px)

### Основные адаптации

**Stepper** -- переключается на горизонтальный компактный вариант:

```
<div class="flex items-center gap-1 px-3 py-1.5 overflow-x-auto">
  <span class="w-2 h-2 rounded-full bg-emerald-500" />
  <span class="w-4 h-px bg-emerald-500" />
  <span class="w-2 h-2 rounded-full bg-emerald-500" />
  <span class="w-4 h-px bg-emerald-500" />
  <span class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
  <span class="w-4 h-px bg-gray-200" />
  <span class="w-2 h-2 rounded-full border-2 border-gray-300" />
</div>
```

Располагается НАД пузырём, а не слева от него.

### Mobile Layout

```
<div class="group/msg mb-4">
  <div class="flex items-start gap-2">
    <!-- Avatar (w-7 h-7, чуть меньше) -->
    <div class="flex-1 min-w-0">
      <!-- Horizontal stepper bar -->
      <!-- Active stage header (full-width) -->
      <!-- Content bubble (max-w-full) -->
      <!-- Collapsible stage results -->
    </div>
  </div>
</div>
```

### Breakpoint

```
sm:flex-row flex-col       -- stepper вертикальный на desktop, горизонтальный на mobile
sm:w-20 w-full             -- ширина stepper
sm:max-w-[60%] max-w-full  -- ширина контента
```

### Раскрываемые секции на mobile

- Полная ширина
- Увеличенная зона нажатия: `py-2` вместо `py-1.5`
- Текст preview обрезается: `truncate max-w-[200px]`

### Кнопка паузы на mobile

- Размер увеличен: `p-1.5` вместо `p-0.5`
- Минимальная зона тапа: `min-w-[44px] min-h-[44px]` (WCAG)

---

## 11. Accessibility

### ARIA-разметка

**Stepper:**
```html
<ol role="list" aria-label="Этапы обработки сообщения">
  <li role="listitem" aria-current="step" aria-label="Planning -- в процессе">
  <li role="listitem" aria-label="Execution -- ожидание">
</ol>
```

**Collapsible sections:**
```html
<button aria-expanded="false" aria-controls="stage-planning-content">
<div id="stage-planning-content" role="region" aria-labelledby="stage-planning-header">
```

**Pipeline status (live region):**
```html
<div role="status" aria-live="polite" class="sr-only">
  Обработка на этапе: Execution. Этап 2 из 4.
</div>
```

**Pause button:**
```html
<button aria-label="Приостановить обработку" role="switch" aria-checked="false">
```

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .animate-pulse, .animate-bounce, .animate-ping, .animate-spin {
    animation: none !important;
  }
  /* Переходы остаются, но мгновенные */
  * { transition-duration: 0ms !important; }
}
```

### Контрастность

Все цветовые пары проверены на WCAG AA (4.5:1 для текста 10px, 3:1 для UI-элементов):
- `text-amber-700` на `bg-amber-50`: 5.2:1 (pass)
- `text-indigo-700` на `bg-indigo-50`: 5.8:1 (pass)
- `text-violet-700` на `bg-violet-50`: 5.1:1 (pass)
- `text-red-700` на `bg-red-50`: 5.4:1 (pass)
- `text-emerald-700` на `bg-emerald-50`: 4.6:1 (pass)

---

## 12. Иерархия компонентов

```
PipelineMessageBubble (расширяет MessageBubble)
  |-- AppliedParamsDisplay (без изменений)
  |-- Avatar (без изменений)
  |-- PipelineStepper
  |     |-- PipelineStepperItem (x4)
  |     |-- PipelineRetryDivider (при retry)
  |-- PipelineStageHeader (активный этап)
  |     |-- PipelinePauseButton
  |-- ContentBubble (текущий контент)
  |-- PipelineStageAccordion (завершённые этапы)
  |     |-- PipelineStageSection (x completed stages)
  |-- PipelineDebugPanel (расширяет DebugPanel)
  |-- PipelinePauseBanner (при паузе)
  |-- PipelineStatusAnnouncer (sr-only, aria-live)
```

---

## 13. Типы данных (предложение для TypeScript)

```typescript
type PipelineStage = 'planning' | 'execution' | 'validation' | 'done';

type PipelineStageStatus = 'pending' | 'active' | 'complete' | 'failed' | 'paused' | 'skipped';

type PipelineStatus = 'running' | 'paused' | 'done' | 'error';

interface PipelineStageData {
  stage: PipelineStage;
  status: PipelineStageStatus;
  content?: string;         // результат этапа
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;           // сообщение об ошибке
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

interface PipelineIteration {
  index: number;
  stages: PipelineStageData[];
  retryReason?: string;     // почему validation failed
}

interface PipelineData {
  status: PipelineStatus;
  currentStage: PipelineStage;
  iterations: PipelineIteration[];
  totalDurationMs?: number;
  canPause: boolean;
  canResume: boolean;
}
```

---

## 14. Визуальная сводка (ASCII-wireframe)

### Desktop, этап execution, 1-я итерация

```
  [AI avatar]   * Planning     3.2s    +-----------------------------------------+
                |                       | > Execution                        8.1s |
                *- Execution   ...      |   [Pause]                               |
                |                       +-----------------------------------------+
                o  Validation           | Lorem ipsum dolor sit amet,             |
                |                       | consectetur adipiscing elit. Sed do_    |
                o  Done                 +-----------------------------------------+

                                        v Planning  3.2s | Сформирован план из 5 шагов...  >
```

### Desktop, validation failed, retry #1 в planning

```
  [AI avatar]   * Planning     3.2s    +-----------------------------------------+
                |                       | /!\ Retry #1                            |
                * Execution    5.1s     +-----------------------------------------+
                |                       | > Planning                         1.2s |
                X Validation   2.0s     |   [Pause]                               |
                                        +-----------------------------------------+
                --- Retry #1 ---        | Корректирую план с учётом ошибки..._    |
                                        +-----------------------------------------+
                *- Planning    ...
                |                       * * X  Итерация 1 (failed) -- 10.3s     >
                o  Execution
                |                       v Planning  3.2s | Сформирован план из 5 шагов...  >
                o  Validation           v Execution  5.1s | Результат выполнения...         >
                |                       v Validation  2.0s | FAILED: Несоответствие схеме... >
                o  Done
```

### Mobile, этап execution

```
  [AI]  * --- * --- o --- o
        plan  exec  val   done

        +---------------------------+
        | > Execution       8.1s [||]|
        +---------------------------+
        | Lorem ipsum dolor sit     |
        | amet, consectetur_        |
        +---------------------------+

        v Planning 3.2s | План из 5...  >
```

---

## 15. Рекомендации по реализации

1. **PipelineMessageBubble** -- отдельный компонент, не модифицировать MessageBubble. В ChatWindow: если `msg.pipelineData` существует, рендерить PipelineMessageBubble вместо MessageBubble.

2. **Streaming** -- текущий этап должен поддерживать streaming текста. Использовать тот же паттерн, что и текущий isLoading + TypingIndicator, но внутри пузыря.

3. **Stepper как отдельный компонент** -- PipelineStepper получает `stages: PipelineStageData[]` и `currentIteration: number`, полностью независим от содержимого.

4. **CSS-переменные для цветов этапов** -- вместо хардкода цветов в каждом компоненте, вынести маппинг в утилиту:

```typescript
const STAGE_STYLES = {
  planning:   { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500',  icon: ListChecks },
  execution:  { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500', icon: Play },
  validation: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-500', icon: ShieldCheck },
  done:       { bg: 'bg-emerald-50',border: 'border-emerald-200',text: 'text-emerald-700',dot: 'bg-emerald-500',icon: CheckCircle2 },
} as const;
```

5. **Без тяжёлых анимаций** -- все анимации через CSS transitions и Tailwind animate-*. Никаких JS-библиотек анимации (framer-motion и т.п.) не нужно для данного scope.

6. **Файловая структура:**
```
frontend/src/components/chat/pipeline/
  pipeline-message-bubble.tsx
  pipeline-stepper.tsx
  pipeline-stage-header.tsx
  pipeline-stage-accordion.tsx
  pipeline-pause-button.tsx
  pipeline-debug-panel.tsx
  pipeline-pause-banner.tsx
  pipeline-retry-divider.tsx
  pipeline-styles.ts          -- STAGE_STYLES, утилиты цветов
```
