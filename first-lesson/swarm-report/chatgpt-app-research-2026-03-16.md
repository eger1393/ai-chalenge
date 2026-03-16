# Research: ChatGPT Web App — 2026-03-16

## Задача
Создать fullstack-приложение: NestJS backend + Next.js frontend в Docker. Авторизация (один захардкоженный пользователь), чат с ChatGPT через API-ключ из env.

---

## Сводка консилиума

### Архитектор

**Структура:** монорепо — `backend/`, `frontend/`, `shared/`

**Backend (NestJS):**
- Два модуля: `AuthModule` + `ChatModule`
- JWT через httpOnly cookie (`Set-Cookie` из backend)
- `JwtStrategy` + `JwtAuthGuard` через Passport
- `ADMIN_PASSWORD_HASH` в env (bcrypt), НЕ plaintext
- Rate limiting: `@nestjs/throttler` — 5 req/min на login, 20 req/min на chat
- Streaming SSE для ChatGPT (обязательно, без этого UX неприемлем)
- ValidationPipe глобально с `whitelist: true`

**Frontend (Next.js):**
- App Router, middleware.ts для auth guard
- Никакого localStorage — только httpOnly cookie
- `credentials: 'include'` во всех fetch-запросах

**CORS:**
- `origin: process.env.CORS_ORIGIN` (НЕ `*`)
- `credentials: true`

**Docker:** multi-stage builds, bridge network `app-network`

---

### Фронтенд-эксперт

- **Router:** App Router (Next.js 14+)
- **State:** `useContext` для auth + `useReducer` для чата — Zustand/Redux избыточны
- **JWT:** httpOnly cookie через Route Handler (клиент токен не видит)
- **API:** нативный fetch (axios не поддерживает Next.js cache extensions)
- **Streaming:** SSE через `ReadableStream`, хук `useChat` с `reader.read()`
- **Route protection:** `middleware.ts` на Edge Runtime

**Файловая структура frontend:**
```
src/
  app/
    (auth)/login/page.tsx
    (chat)/page.tsx
    api/auth/login/route.ts    ← Route Handler: проксирует + ставит cookie
    api/auth/logout/route.ts
    api/chat/route.ts          ← Route Handler: проксирует стрим
  components/auth/LoginForm.tsx
  components/chat/ChatContainer.tsx, MessageList.tsx, MessageBubble.tsx, ChatInput.tsx
  hooks/useChat.ts, useAuth.ts, useAutoScroll.ts
  context/AuthContext.tsx
  middleware.ts
```

---

### UI-дизайнер

- **Библиотека:** Tailwind CSS v4 + shadcn/ui + Lucide React
- **Шрифт:** Inter (next/font)
- **Палитра:** нейтральная серая + акцент индиго (`#6366F1`), поддержка dark mode
- **Логин:** центрированная карточка max-w-sm, два поля, одна кнопка, состояния: default / loading / error
- **Чат:** sticky header (h-14) + scrollable messages (flex-1, max-w-3xl) + sticky input
- **Сообщения:** user — справа на индиго; assistant — слева на muted с аватаром
- **UX:** auto-scroll, typing indicator (3 точки), auto-resize textarea, Enter = отправить
- **Accessibility:** WCAG 2.1 AA, focus-visible, aria-label, role="log"

---

### DevOps

- **Структура:** docker-compose.yml в корне монорепо
- **Сети:** одна bridge-сеть `app-network`
- **Nginx:** только в production, в dev — прямые порты (3000/3001)
- **Multi-stage builds:** build stage (с devDeps) → runtime stage (alpine, non-root user)
- **Env:** `.env` в `.gitignore`, `.env.example` с плейсхолдерами в репо
- **Dev режим:** только локальный Docker + docker-compose

---

### API-дизайнер

**Эндпоинты:**

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| POST | `/api/auth/login` | нет | Логин, устанавливает httpOnly cookie |
| POST | `/api/auth/refresh` | нет | Refresh access token |
| GET | `/api/auth/me` | Bearer | Данные текущего пользователя |
| POST | `/api/chat/message` | Bearer | Проксирование в ChatGPT (SSE стрим) |

**JWT:**
- Access token: 15 минут
- Refresh token: 7 дней
- Payload: `{ sub: "admin", username: "admin", iat, exp }`

**Ошибки OpenAI:** маппятся в 502/504

**Rate limiting:** login — 5 req/min по IP; chat — 20 req/min по user

---

## Ключевые технические решения

| Решение | Выбор | Причина |
|---------|-------|---------|
| JWT хранение | httpOnly cookie | XSS-защита |
| Streaming | SSE | UX — пользователь видит ответ сразу |
| State management | useContext/useReducer | Достаточно для масштаба проекта |
| API client | нативный fetch | Next.js cache extensions |
| Docker | multi-stage builds | Малый размер production-образов |
| Пароль admin | bcrypt hash в env | Plaintext в коде = постоянная дыра |
| CORS origin | конкретный URL | `*` несовместим с credentials:true |

## Риски (зафиксированы)
1. Таймауты OpenAI (30-60с) — нужен explicit timeout
2. Размер conversation history — лимит 50 сообщений в запросе
3. Стоимость API — rate limiting + max_tokens
