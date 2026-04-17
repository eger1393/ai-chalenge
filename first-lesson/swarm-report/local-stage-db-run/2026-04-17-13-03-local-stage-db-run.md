# Отчёт: локальный запуск с stage PostgreSQL

## Задача

Развернуть проект локально так, чтобы backend и frontend работали на локальной машине, но backend использовал stage PostgreSQL как основную БД. MCP-сервисы можно не поднимать.

## Что сделано

- Сняты актуальные backend env-значения со stage `.env`
- Создан локальный корневой `.env` на основе stage-контура
- Для локального запуска сделаны только осознанные локальные переопределения:
  - `DATABASE_URL` переведён на внешний stage PostgreSQL: `167.235.226.104:6502`
  - `FRONTEND_URL` переведён на `http://localhost:3001`
  - `MCP_POSTGRES_URL`, `MCP_GITHUB_EXPLORER_URL`, `MCP_KNOWLEDGE_BASE_URL` обнулены, чтобы локальный backend не пытался подключаться к MCP
- Локально подняты:
  - backend на `http://localhost:3000`
  - frontend на `http://localhost:3001`

## Проверка

- Прямое подключение к stage PostgreSQL с локальной машины:
  - `select current_database(), current_user, count(*) from messages;`
  - результат: `chatdb`, `chatuser`, `68`
- Backend стартовал и подключился к PostgreSQL
- Локальный backend отвечает:
  - `GET /api/auth/me` → `401 Unauthorized`
- Локальный backend видит stage-данные:
  - `select count(*) from conversations;` → `16`
- Локальный frontend отвечает:
  - `GET http://127.0.0.1:3001` → `307` на `/login`
- Логин через локальный backend с stage admin-учёткой проходит успешно

## Итоговый контур

- frontend: `http://localhost:3001`
- backend API: `http://localhost:3000/api`
- database: stage PostgreSQL `167.235.226.104:6502/chatdb`
- MCP: отключены на локальном запуске

## Ограничения

- Локальный backend работает против stage БД, поэтому любые изменения данных из локального интерфейса будут менять stage-данные
- MCP локально намеренно отключён и не участвует в работе

## Статус

Готово
