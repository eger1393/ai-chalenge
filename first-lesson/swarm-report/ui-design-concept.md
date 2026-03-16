# UI Design Concept: Login + ChatGPT Web App

Дата: 2026-03-16
Автор: UI-дизайнер

---

## 1. Рекомендация по стеку UI

| Инструмент | Назначение | Обоснование |
|---|---|---|
| **Tailwind CSS v4** | Утилитарные стили | Быстрая итерация, консистентность, минимальный CSS bundle |
| **shadcn/ui** | Библиотека компонентов | Копируемые компоненты (не зависимость), построены на Radix UI, полная доступность из коробки, идеально интегрируются с Tailwind |
| **Lucide React** | Иконки | Легковесные, консистентные, входят в экосистему shadcn |
| **next-themes** | Темизация | Поддержка dark mode без FOUC |

**Почему shadcn/ui, а не Material UI или Ant Design:**
- Нет vendor lock-in: компоненты копируются в проект и полностью кастомизируемы
- Нативная интеграция с Tailwind (нет конфликтов стилей)
- Основа на Radix UI дает WCAG 2.1 AA accessibility из коробки
- Минимальный bundle size: подключаются только используемые компоненты

---

## 2. Дизайн-токены (Design Tokens)

### 2.1 Цветовая палитра

Минималистичный стиль с нейтральной базой и одним акцентным цветом.

```
/* CSS Variables -- определяются в globals.css */

:root {
  /* Нейтральные */
  --background:       0 0% 100%;        /* #FFFFFF */
  --foreground:       240 10% 3.9%;     /* #0A0A0B */
  --muted:            240 4.8% 95.9%;   /* #F4F4F5 */
  --muted-foreground: 240 3.8% 46.1%;   /* #71717A */
  --border:           240 5.9% 90%;     /* #E4E4E7 */
  --input:            240 5.9% 90%;     /* #E4E4E7 */
  --ring:             240 5.9% 10%;     /* #18181B */

  /* Акцент -- приглушенный индиго */
  --primary:            239 84% 67%;    /* #6366F1 */
  --primary-foreground: 0 0% 100%;      /* #FFFFFF */

  /* Деструктивные действия */
  --destructive:            0 84% 60%;  /* #EF4444 */
  --destructive-foreground: 0 0% 100%;

  /* Карточки и поверхности */
  --card:            0 0% 100%;
  --card-foreground: 240 10% 3.9%;

  /* Радиусы */
  --radius: 0.625rem;  /* 10px -- мягкие, современные углы */
}

.dark {
  --background:       240 10% 3.9%;     /* #0A0A0B */
  --foreground:       0 0% 98%;         /* #FAFAFA */
  --muted:            240 3.7% 15.9%;   /* #27272A */
  --muted-foreground: 240 5% 64.9%;     /* #A1A1AA */
  --border:           240 3.7% 15.9%;   /* #27272A */
  --primary:          239 84% 67%;      /* #6366F1 */
  --card:             240 10% 3.9%;
}
```

### 2.2 Типографика

```
/* Шрифт: Inter (Google Fonts) -- оптимален для интерфейсов */
font-family: 'Inter', system-ui, -apple-system, sans-serif;

/* Размеры */
--text-xs:   0.75rem / 1rem;      /* 12px -- метаданные, подписи */
--text-sm:   0.875rem / 1.25rem;  /* 14px -- вспомогательный текст */
--text-base: 1rem / 1.5rem;       /* 16px -- основной текст */
--text-lg:   1.125rem / 1.75rem;  /* 18px -- заголовки секций */
--text-xl:   1.25rem / 1.75rem;   /* 20px -- заголовок страницы */
--text-2xl:  1.5rem / 2rem;       /* 24px -- крупный заголовок */

/* Жирность */
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
```

### 2.3 Тени и эффекты

```
--shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
```

---

## 3. Страница логина

### 3.1 Layout

```
+------------------------------------------------------------------+
|                                                                    |
|                                                                    |
|                     +-------------------------+                    |
|                     |                         |                    |
|                     |     [Logo / App Name]   |                    |
|                     |                         |                    |
|                     |  +----- Username -----+ |                    |
|                     |  |                     | |                    |
|                     |  +---------------------+ |                    |
|                     |                         |                    |
|                     |  +----- Password -----+ |                    |
|                     |  |                     | |                    |
|                     |  +---------------------+ |                    |
|                     |                         |                    |
|                     |  [ ====  Sign In  ==== ]|                    |
|                     |                         |                    |
|                     +-------------------------+                    |
|                                                                    |
|                                                                    |
+------------------------------------------------------------------+
```

Центрированная карточка на нейтральном фоне. Ничего лишнего.

### 3.2 Структура компонентов

```
LoginPage
  +-- div.login-wrapper         // flex centering, min-h-screen
      +-- Card                  // shadcn Card, max-w-sm, shadow-lg
          +-- CardHeader
          |   +-- Logo          // SVG или текст "ChatApp"
          |   +-- CardTitle     // "Sign In"
          |   +-- CardDescription  // "Enter your credentials"
          +-- CardContent
          |   +-- form
          |       +-- div.field
          |       |   +-- Label       // "Username"
          |       |   +-- Input       // type="text", autoFocus
          |       |   +-- ErrorMsg    // условный, красный текст
          |       +-- div.field
          |       |   +-- Label       // "Password"
          |       |   +-- Input       // type="password"
          |       |   +-- ErrorMsg
          |       +-- Button          // type="submit", "Sign In"
          +-- CardFooter (опционально)
              +-- ErrorBanner   // общая ошибка авторизации
```

### 3.3 Tailwind-классы (конкретные)

```tsx
// LoginPage wrapper
<div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">

// Card
<Card className="w-full max-w-sm shadow-lg">

// Header
<CardHeader className="space-y-1 text-center">
  <h1 className="text-2xl font-semibold tracking-tight">ChatApp</h1>
  <CardDescription className="text-sm text-muted-foreground">
    Enter your credentials to continue
  </CardDescription>
</CardHeader>

// Input field
<div className="space-y-2">
  <Label htmlFor="username" className="text-sm font-medium">
    Username
  </Label>
  <Input
    id="username"
    placeholder="your.username"
    className="h-10"
    autoFocus
  />
</div>

// Submit button
<Button className="w-full h-10" type="submit" disabled={isLoading}>
  {isLoading ? (
    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  ) : null}
  Sign In
</Button>

// Error banner (при ошибке авторизации)
<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
  <p>Invalid username or password</p>
</div>
```

### 3.4 Состояния

| Состояние | Визуал |
|---|---|
| **Default** | Чистая форма, фокус на поле username |
| **Loading** | Кнопка disabled, спиннер Loader2 внутри кнопки, поля disabled |
| **Error (поле)** | Красная рамка на Input (`border-destructive`), текст ошибки под полем |
| **Error (общая)** | Красный баннер над кнопкой |
| **Success** | Redirect на /chat, без визуальной задержки |

---

## 4. Чат-интерфейс

### 4.1 Layout

```
+------------------------------------------------------------------+
| [Logo]  ChatApp                              [User] [Sign Out]    |  <- Header (h-14)
+------------------------------------------------------------------+
|                                                                    |
|                                                                    |
|     +--------------------------------------------------+          |
|     |  User bubble (right-aligned)                     |          |
|     +--------------------------------------------------+          |
|                                                                    |
|  +--------------------------------------------------+             |
|  |  Assistant bubble (left-aligned)                  |             |
|  |  with markdown rendering                          |             |
|  +--------------------------------------------------+             |
|                                                                    |
|     +--------------------------------------------------+          |
|     |  User bubble                                     |          |
|     +--------------------------------------------------+          |
|                                                                    |
|  +--------------------------------------------------+             |
|  |  ... (typing indicator)                            |             |
|  +--------------------------------------------------+             |
|                                                                    |
+------------------------------------------------------------------+
|  +----------------------------------------------+ [Send]          |  <- Input area (min-h-14)
|  | Type your message...                          |                 |
|  +----------------------------------------------+                 |
+------------------------------------------------------------------+
```

### 4.2 Структура компонентов

```
ChatPage
  +-- div.chat-layout              // flex flex-col h-screen
      +-- ChatHeader               // sticky top, border-b
      |   +-- Logo
      |   +-- span "ChatApp"
      |   +-- div.spacer (flex-1)
      |   +-- UserMenu             // avatar + dropdown (Sign Out)
      +-- ChatMessages             // flex-1 overflow-y-auto
      |   +-- div.messages-container  // max-w-3xl mx-auto
      |       +-- EmptyState       // если нет сообщений
      |       +-- MessageBubble[]  // список сообщений
      |       |   +-- Avatar      // user / assistant
      |       |   +-- div.content  // текст + markdown
      |       |   +-- span.time   // timestamp
      |       +-- TypingIndicator  // при ожидании ответа
      +-- ChatInput                // sticky bottom, border-t
          +-- div.input-container   // max-w-3xl mx-auto
              +-- Textarea         // auto-resize
              +-- Button           // иконка Send
```

### 4.3 Tailwind-классы (конкретные)

```tsx
// Chat layout
<div className="flex h-screen flex-col bg-background">

// Header
<header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:px-6">
  <span className="text-lg font-semibold">ChatApp</span>
  <div className="flex-1" />
  <Button variant="ghost" size="sm">Sign Out</Button>
</header>

// Messages area
<div className="flex-1 overflow-y-auto">
  <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-6">
    {messages.map(msg => <MessageBubble key={msg.id} {...msg} />)}
  </div>
</div>

// User message bubble
<div className="flex justify-end">
  <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground">
    <p className="text-sm leading-relaxed">{content}</p>
    <span className="mt-1 block text-right text-xs opacity-60">{time}</span>
  </div>
</div>

// Assistant message bubble
<div className="flex gap-3">
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
    <Bot className="h-4 w-4 text-muted-foreground" />
  </div>
  <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-muted px-4 py-2.5">
    <div className="prose prose-sm text-foreground">{content}</div>
    <span className="mt-1 block text-xs text-muted-foreground">{time}</span>
  </div>
</div>

// Typing indicator
<div className="flex gap-3">
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
    <Bot className="h-4 w-4 text-muted-foreground" />
  </div>
  <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
    <div className="flex gap-1">
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
    </div>
  </div>
</div>

// Input area
<div className="shrink-0 border-t bg-background p-4">
  <div className="mx-auto flex max-w-3xl items-end gap-2">
    <Textarea
      placeholder="Type your message..."
      className="min-h-[44px] max-h-[200px] resize-none rounded-xl"
      rows={1}
      onKeyDown={handleKeyDown}  // Enter = send, Shift+Enter = newline
    />
    <Button
      size="icon"
      className="h-11 w-11 shrink-0 rounded-xl"
      disabled={!hasText || isLoading}
    >
      <Send className="h-4 w-4" />
    </Button>
  </div>
</div>

// Empty state (когда чат пуст)
<div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
  <div className="rounded-full bg-muted p-4">
    <MessageSquare className="h-8 w-8 text-muted-foreground" />
  </div>
  <div>
    <h2 className="text-lg font-medium">Start a conversation</h2>
    <p className="mt-1 text-sm text-muted-foreground">
      Send a message to begin chatting with the assistant.
    </p>
  </div>
</div>
```

### 4.4 Состояния чата

| Состояние | Визуал |
|---|---|
| **Empty** | Центрированная иллюстрация + текст "Start a conversation" |
| **Loading (ответ)** | Typing indicator (три анимированные точки) в бабле ассистента |
| **Error (сеть)** | Toast notification сверху: "Failed to send. Retry?" с кнопкой Retry |
| **Error (API)** | Красный бабл ассистента с текстом ошибки и кнопкой Retry |
| **Streaming** | Текст появляется посимвольно в бабле ассистента (если реализован SSE) |

---

## 5. UX-паттерны

### 5.1 Навигация и авторизация

- Неавторизованный пользователь всегда попадает на `/login`
- После успешного входа -- redirect на `/chat`
- Кнопка Sign Out в хедере чата возвращает на `/login`
- JWT/session хранится в httpOnly cookie (не localStorage -- безопасность)

### 5.2 Клавиатурные сокращения

| Действие | Комбинация |
|---|---|
| Отправить сообщение | `Enter` |
| Новая строка | `Shift + Enter` |
| Фокус на поле ввода | `/` (когда фокус не в textarea) |

### 5.3 Auto-scroll

- При получении нового сообщения -- автоскролл вниз
- Если пользователь проскроллил вверх (более 100px от низа) -- НЕ скроллить, показать кнопку "Scroll to bottom"

### 5.4 Textarea auto-resize

- Минимальная высота: 44px (1 строка)
- Максимальная высота: 200px (примерно 8 строк)
- После отправки -- сброс к 1 строке

---

## 6. Адаптивность

### Breakpoints (Tailwind defaults)

| Breakpoint | Ширина | Изменения |
|---|---|---|
| Mobile | < 640px | Padding сужается, бабблы до 90% ширины, хедер компактнее |
| Tablet | 640-1023px | Основной layout сохраняется |
| Desktop | >= 1024px | max-w-3xl контейнер сообщений, комфортные отступы |

### Mobile-специфичные адаптации

```tsx
// Messages -- ширина бабблов
// Desktop: max-w-[75%]
// Mobile:  max-w-[90%]
<div className="max-w-[90%] sm:max-w-[75%] ...">

// Input area padding
<div className="p-3 sm:p-4">

// Header
<header className="px-3 sm:px-4 lg:px-6">
```

### Важно: мобильная клавиатура

На мобильных устройствах при открытии клавиатуры input area должен оставаться видимым. Решение:

```css
/* Предотвращает скачок layout при открытии мобильной клавиатуры */
.chat-layout {
  height: 100dvh; /* dynamic viewport height */
}
```

В Tailwind: `h-dvh` (Tailwind v4).

---

## 7. Анимации и переходы

### Принципы

- Длительность: 150-200ms для микровзаимодействий, 300ms для появления элементов
- Easing: `ease-out` для появления, `ease-in` для исчезновения
- Никаких анимаций ради анимаций -- каждая имеет функцию

### Конкретные анимации

| Элемент | Анимация | Реализация |
|---|---|---|
| Новое сообщение | Fade in + slide up | `animate-in fade-in-0 slide-in-from-bottom-2 duration-200` |
| Typing indicator | Bouncing dots | `animate-bounce` с задержками |
| Кнопка Send | Scale on press | `active:scale-95 transition-transform` |
| Error toast | Slide in from top | `animate-in slide-in-from-top-2 duration-300` |
| Login card | Fade in on load | `animate-in fade-in-0 duration-500` |

---

## 8. Accessibility (WCAG 2.1 AA)

| Требование | Реализация |
|---|---|
| Контраст текста | Минимум 4.5:1 для body, 3:1 для крупного текста. Наша палитра проверена |
| Focus visible | `focus-visible:ring-2 focus-visible:ring-ring` на всех интерактивных элементах |
| Screen reader | `aria-label` на кнопках без текста (Send), `role="log"` на контейнере сообщений, `aria-live="polite"` на typing indicator |
| Keyboard nav | Все действия доступны с клавиатуры, tab order логичен |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` -- отключить анимации |

---

## 9. Файловая структура компонентов (рекомендация)

```
src/
  app/
    login/
      page.tsx              // LoginPage
    chat/
      page.tsx              // ChatPage
    layout.tsx              // Root layout (fonts, theme provider)
    globals.css             // CSS variables, Tailwind base
  components/
    ui/                     // shadcn/ui компоненты
      button.tsx
      card.tsx
      input.tsx
      label.tsx
      textarea.tsx
    chat/
      chat-header.tsx       // Header с логотипом и Sign Out
      chat-messages.tsx     // Контейнер сообщений с auto-scroll
      message-bubble.tsx    // Один бабл сообщения (user/assistant)
      typing-indicator.tsx  // Три анимированные точки
      chat-input.tsx        // Textarea + Send button
      empty-state.tsx       // Пустой чат
    login/
      login-form.tsx        // Форма авторизации
      error-banner.tsx      // Баннер ошибки
  lib/
    utils.ts                // cn() helper (clsx + tailwind-merge)
```

---

## 10. Установка и настройка

```bash
# 1. Создать Next.js проект
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir

# 2. Установить shadcn/ui
npx shadcn@latest init

# 3. Добавить нужные компоненты
npx shadcn@latest add button card input label textarea

# 4. Установить иконки
npm install lucide-react

# 5. Шрифт Inter -- через next/font (встроен в Next.js)
```
