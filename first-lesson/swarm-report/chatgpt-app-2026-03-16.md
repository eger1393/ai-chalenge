# ChatGPT Web App — 2026-03-16

## Описание задачи

Создать fullstack-приложение с нуля:
- Backend (NestJS + TypeScript): один захардкоженный пользователь admin, JWT аутентификация, проксирование запросов к ChatGPT
- Frontend (React + Next.js + TypeScript): страница логина + чат-интерфейс
- Оба сервиса в Docker контейнерах
- API ключ ChatGPT из env переменной

## Итоги Research (консилиум)

- Монорепо: backend/ + frontend/ в одной директории
- JWT токены в памяти (не localStorage) — XSS защита
- bcryptjs для хэширования пароля admin
- JSON ответ от ChatGPT (не SSE) — MVP
- Multi-stage Docker builds, мост-сеть app-network
- Tailwind CSS + компоненты (Inter шрифт, индиго акцент)

## Реализованные файлы

### Backend (C:/Source/ai-chalenge/first-lesson/backend/)

- `src/main.ts` — точка входа, CORS, helmet, ValidationPipe
- `src/app.module.ts` — ConfigModule, ThrottlerModule, AuthModule, ChatModule
- `src/auth/auth.module.ts` — PassportModule + JwtModule
- `src/auth/auth.service.ts` — login (bcrypt), refresh token, getMe
- `src/auth/auth.controller.ts` — POST /auth/login, POST /auth/refresh, GET /auth/me
- `src/auth/strategies/jwt.strategy.ts` — Passport JWT
- `src/auth/guards/jwt-auth.guard.ts` — guard для защищённых маршрутов
- `src/auth/dto/login.dto.ts`, `refresh.dto.ts` — валидация
- `src/chat/chat.service.ts` — OpenAI SDK интеграция с обработкой ошибок
- `src/chat/chat.controller.ts` — POST /chat/message (JwtAuthGuard + throttler)
- `src/chat/dto/message.dto.ts` — валидация сообщений и истории
- `Dockerfile` — multi-stage build (builder + alpine runtime, non-root user)

### Frontend (C:/Source/ai-chalenge/first-lesson/frontend/)

- `src/app/layout.tsx`, `globals.css` — корневой layout с Inter шрифтом
- `src/app/page.tsx` — redirect на /login
- `src/app/login/page.tsx` — страница логина
- `src/app/chat/page.tsx` — страница чата с auth guard
- `src/lib/tokens.ts` — хранение JWT в памяти
- `src/lib/api.ts` — API клиент с auto-refresh при 401
- `src/context/auth-context.tsx` — AuthProvider + useAuth
- `src/hooks/use-chat.ts` — управление состоянием чата
- `src/hooks/use-auto-scroll.ts` — автоскролл
- `src/components/login/login-form.tsx` — форма логина
- `src/components/chat/chat-window.tsx` — основной чат-компонент
- `src/components/chat/message-bubble.tsx` — пузыри сообщений
- `src/components/chat/typing-indicator.tsx` — индикатор печати
- `src/components/chat/chat-input.tsx` — поле ввода
- `src/components/chat/empty-state.tsx` — пустое состояние
- `Dockerfile` — 3-stage build (deps + builder + alpine runtime)

### Корень проекта

- `docker-compose.yml` — оркестрация, сеть app-network, порты 3000/3001
- `.env.example` — шаблон переменных окружения
- `.gitignore` — исключения

## Результаты Validation

### Backend (6/6 ✅)

- POST /api/auth/login + правильные данные → 200 + JWT токены ✅
- POST /api/auth/login + неправильный пароль → 401 ✅
- GET /api/auth/me + Bearer токен → 200 + {username: admin, role: admin} ✅
- GET /api/auth/me без токена → 401 ✅
- POST /api/auth/refresh + refreshToken → 200 + новые токены ✅
- POST /api/chat/message без токена → 401 ✅

### Web (3/3 URL + частично ✅)

- http://localhost:3001 → 307 redirect ✅
- http://localhost:3001/login → 200 ✅
- http://localhost:3001/chat → 200 ✅
- Визуальная проверка — доступна вручную (Chrome MCP недоступен)

### Docker

- docker-compose build — оба образа собраны ✅
- docker-compose up -d — оба контейнера запущены ✅

## Проблемы и решения

1. Bcrypt хэш в .env — `$` знаки конфликтовали с docker-compose интерполяцией → экранированы как `$$`
2. next.config.ts → next.config.mjs (Next.js 14.2.3 не поддерживает TS конфиг)
3. version: '3.8' obsolete warning в docker-compose — не критично

## Инструкция по запуску

```bash
# 1. Сгенерировать хэш пароля:
cd backend && node -e "require('bcryptjs').hash('yourpassword',10).then(console.log)"

# 2. Создать .env из .env.example, заполнить OPENAI_API_KEY и ADMIN_PASSWORD_HASH (с экранированием $$)

# 3. Запустить:
docker-compose up -d

# 4. Открыть http://localhost:3001
# Логин: admin / ваш_пароль
```

## Статус

**Done ✅** (тест чата пропущен — OPENAI_API_KEY не предоставлен для validation)
