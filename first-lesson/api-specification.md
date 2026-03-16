# REST API Specification: ChatGPT Proxy Service

**Version:** 1.0.0
**Base URL:** `http://localhost:3000/api`
**Date:** 2026-03-16

---

## 1. Overview

API предоставляет:
- Аутентификацию через JWT (один захардкоженный пользователь)
- Проксирование запросов к OpenAI ChatGPT API
- Rate limiting на эндпоинты чата

---

## 2. Общие соглашения

### Base path

Все эндпоинты имеют префикс `/api`. Это стандартная практика для NestJS, позволяющая отделить API от статики и фронтенда.

### Content-Type

Все запросы и ответы используют `application/json`.

### Формат успешного ответа

```json
{
  "data": { ... },
  "timestamp": "2026-03-16T12:00:00.000Z"
}
```

### Формат ошибки (единый для всех эндпоинтов)

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid credentials",
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/auth/login"
}
```

---

## 3. Аутентификация

### JWT

- Алгоритм: HS256
- Время жизни access token: **15 минут**
- Время жизни refresh token: **7 дней**
- Secret хранится в переменной окружения `JWT_SECRET`

### JWT Payload (access token)

```json
{
  "sub": "admin",
  "role": "admin",
  "iat": 1742126400,
  "exp": 1742127300
}
```

Поля:
- `sub` — идентификатор пользователя (login)
- `role` — роль пользователя
- `iat` — время выдачи (Unix timestamp)
- `exp` — время истечения (Unix timestamp)

### JWT Payload (refresh token)

```json
{
  "sub": "admin",
  "type": "refresh",
  "iat": 1742126400,
  "exp": 1742731200
}
```

### Передача токена

Заголовок `Authorization: Bearer <access_token>` для всех защищённых эндпоинтов.

---

## 4. Эндпоинты

---

### 4.1 POST /api/auth/login

Аутентификация пользователя. Возвращает пару access + refresh токенов.

**Авторизация:** не требуется

#### Request

```json
{
  "username": "admin",
  "password": "password"
}
```

| Поле       | Тип    | Обязательное | Описание              |
|------------|--------|--------------|-----------------------|
| username   | string | да           | Логин, min 1 символ   |
| password   | string | да           | Пароль, min 1 символ  |

#### Response 200 OK

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  },
  "timestamp": "2026-03-16T12:00:00.000Z"
}
```

| Поле          | Тип    | Описание                              |
|---------------|--------|---------------------------------------|
| accessToken   | string | JWT access token                      |
| refreshToken  | string | JWT refresh token                     |
| expiresIn     | number | Время жизни access token в секундах   |

#### Response 400 Bad Request — невалидное тело

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["username must be a string", "password should not be empty"],
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/auth/login"
}
```

#### Response 401 Unauthorized — неверные credentials

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid username or password",
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/auth/login"
}
```

#### Response 429 Too Many Requests

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Too many login attempts. Try again in 60 seconds",
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/auth/login"
}
```

**Rate limit на login:** 5 запросов в минуту с одного IP (защита от brute-force).

---

### 4.2 POST /api/auth/refresh

Обновление access token по refresh token.

**Авторизация:** не требуется (refresh token передаётся в теле)

#### Request

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Response 200 OK

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  },
  "timestamp": "2026-03-16T12:00:00.000Z"
}
```

#### Response 401 Unauthorized — невалидный или истёкший refresh token

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid or expired refresh token",
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/auth/refresh"
}
```

---

### 4.3 GET /api/auth/me

Получение данных текущего пользователя.

**Авторизация:** Bearer token (обязательно)

#### Request

Заголовок: `Authorization: Bearer <access_token>`

Тело: отсутствует

#### Response 200 OK

```json
{
  "data": {
    "username": "admin",
    "role": "admin"
  },
  "timestamp": "2026-03-16T12:00:00.000Z"
}
```

#### Response 401 Unauthorized — токен отсутствует, невалиден или истёк

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Access token is missing or invalid",
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/auth/me"
}
```

---

### 4.4 POST /api/chat/message

Отправка сообщения через ChatGPT API. Проксирует запрос к OpenAI.

**Авторизация:** Bearer token (обязательно)

#### Request

```json
{
  "message": "Explain how JWT authentication works",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Hello"
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help you today?"
    }
  ]
}
```

| Поле                | Тип      | Обязательное | Описание                                             |
|---------------------|----------|--------------|------------------------------------------------------|
| message             | string   | да           | Текст сообщения, min 1, max 4000 символов            |
| conversationHistory | array    | нет          | История диалога для контекста, max 50 сообщений       |
| conversationHistory[].role    | string | да (если history передан) | "user" или "assistant"        |
| conversationHistory[].content | string | да (если history передан) | Текст сообщения, max 4000    |

**Обоснование дизайна:** Поскольку БД нет, история хранится на клиенте и передаётся с каждым запросом. Это stateless-подход, соответствующий REST-принципам. Поле `conversationHistory` ограничено 50 сообщениями для контроля размера запроса к OpenAI API.

#### Response 200 OK

```json
{
  "data": {
    "reply": "JWT (JSON Web Token) is an open standard (RFC 7519) that defines a compact...",
    "usage": {
      "promptTokens": 150,
      "completionTokens": 280,
      "totalTokens": 430
    }
  },
  "timestamp": "2026-03-16T12:00:05.000Z"
}
```

| Поле                  | Тип    | Описание                                |
|-----------------------|--------|-----------------------------------------|
| reply                 | string | Ответ от ChatGPT                        |
| usage.promptTokens    | number | Количество токенов в промпте            |
| usage.completionTokens| number | Количество токенов в ответе             |
| usage.totalTokens     | number | Общее количество использованных токенов |

#### Response 400 Bad Request — невалидное тело

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["message must be a string", "message should not be empty"],
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/chat/message"
}
```

#### Response 401 Unauthorized

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Access token is missing or invalid",
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/chat/message"
}
```

#### Response 429 Too Many Requests

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Chat rate limit exceeded. Try again in 30 seconds",
  "retryAfter": 30,
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/chat/message"
}
```

#### Response 502 Bad Gateway — ошибка OpenAI API

```json
{
  "statusCode": 502,
  "error": "Bad Gateway",
  "message": "ChatGPT API is temporarily unavailable",
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/chat/message"
}
```

#### Response 504 Gateway Timeout — OpenAI не ответил

```json
{
  "statusCode": 504,
  "error": "Gateway Timeout",
  "message": "ChatGPT API did not respond in time",
  "timestamp": "2026-03-16T12:00:00.000Z",
  "path": "/api/chat/message"
}
```

---

## 5. Rate Limiting

| Эндпоинт              | Лимит              | Окно       | Ключ группировки |
|------------------------|--------------------|-----------:|------------------|
| POST /api/auth/login   | 5 запросов         | 1 минута   | IP-адрес         |
| POST /api/auth/refresh | 10 запросов        | 1 минута   | IP-адрес         |
| POST /api/chat/message | 20 запросов        | 1 минута   | JWT sub (user)   |
| GET /api/auth/me       | 30 запросов        | 1 минута   | JWT sub (user)   |

### Заголовки Rate Limit в ответе

Каждый ответ включает заголовки:

```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1742126460
```

Реализация: пакет `@nestjs/throttler`.

---

## 6. CORS Configuration

```typescript
// main.ts
app.enableCors({
  origin: [
    'http://localhost:3001',       // Next.js dev server
    process.env.FRONTEND_URL,      // Production frontend URL
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours preflight cache
});
```

| Параметр       | Значение                                  | Обоснование                                    |
|----------------|-------------------------------------------|------------------------------------------------|
| origin         | whitelist из env                          | Только доверенные домены                       |
| methods        | GET, POST                                 | Только используемые методы (минимум привилегий)|
| allowedHeaders | Content-Type, Authorization               | Только необходимые заголовки                   |
| credentials    | true                                      | Для передачи Authorization header              |
| maxAge         | 86400                                     | Кэширование preflight на 24 часа              |

---

## 7. Environment Variables

```env
# Server
PORT=3000

# JWT
JWT_SECRET=<strong-random-secret-min-32-chars>
JWT_ACCESS_EXPIRATION=900
JWT_REFRESH_EXPIRATION=604800

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=2048
OPENAI_TIMEOUT=30000

# CORS
FRONTEND_URL=http://localhost:3001

# Rate Limiting
THROTTLE_TTL=60000
THROTTLE_LIMIT=20
```

---

## 8. Сводная таблица эндпоинтов

| Метод | Путь                   | Auth     | Описание                      |
|-------|------------------------|----------|-------------------------------|
| POST  | /api/auth/login        | нет      | Аутентификация                |
| POST  | /api/auth/refresh      | нет      | Обновление access token       |
| GET   | /api/auth/me           | Bearer   | Данные текущего пользователя  |
| POST  | /api/chat/message      | Bearer   | Отправка сообщения в ChatGPT  |

---

## 9. Security Headers

Рекомендуется подключить `helmet` middleware:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'none'
```

---

## 10. Решения и обоснования

### Почему нет POST /auth/logout?

При stateless JWT logout реализуется удалением токена на клиенте. Серверный logout требует blacklist токенов (Redis/DB), что избыточно для проекта с одним пользователем. Access token живёт 15 минут -- это достаточно короткое окно.

### Почему история на клиенте?

Требование "без БД" исключает серверное хранение. Клиент передаёт `conversationHistory` с каждым запросом. Это чистый stateless REST. Ограничение в 50 сообщений защищает от переполнения контекстного окна OpenAI и слишком больших request body.

### Почему refresh token?

Access token живёт 15 минут. Без refresh token пользователю придётся вводить логин/пароль каждые 15 минут. Refresh token (7 дней) решает эту проблему, сохраняя короткое окно для access token (что ограничивает ущерб при компрометации).

### Почему 502/504 для ошибок OpenAI?

API выступает прокси. По стандарту HTTP: 502 Bad Gateway -- upstream вернул ошибку, 504 Gateway Timeout -- upstream не ответил вовремя. Это семантически корректно и понятно клиенту.
