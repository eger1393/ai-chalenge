Выполни деплой проекта first-lesson на сервер.

## Сервер

- **Хост:** `167.235.226.104`, порт SSH: `2222`, user: `root`
- **Репозиторий на сервере:** `/srv/ai-chalange` (ветка `develop`)
- **Директория проекта:** `/srv/ai-chalange/first-lesson`
- **Скрипт деплоя:** `/srv/ai-chalange/update.sh`

## Порты

| Сервис   | Внутренний | Внешний |
| -------- | ---------- | ------- |
| Backend  | 3000       | 6500    |
| Frontend | 3000       | 6501    |

## URL-ы

- Frontend: `http://167.235.226.104:6501`
- Backend API: `http://167.235.226.104:6500/api`

## SSH подключение

```
host: 167.235.226.104
username: root
port: 2222
auth: key
privateKeyPath: C:\Users\eger1\.ssh\main_key
```

## Стадии

### 1. Предпроверка

1. `git status` — если есть незакоммиченные изменения, закоммить их (спроси commit message через `AskUserQuestion`)
2. Запусти `npx tsc --noEmit` в backend и frontend — убедись что компиляция проходит

### 2. Коммит и push

1. Если были незакоммиченные изменения — закоммить, введи сообщение сам, не спрашивай меня.
2. `git push origin develop`
3. Убедись что push прошёл без ошибок

### 3. Деплой на сервере

1. Подключись через `mcp__ssh-mcp__ssh_open_session` с параметрами SSH выше
2. Если добавлялись новые env-переменные — проверь/добавь их в `/srv/ai-chalange/first-lesson/.env`
3. Запусти: `cd /srv/ai-chalange && bash update.sh first-lesson`
4. Дождись завершения, проверь exit code

**Что делает update.sh:**
1. `git pull --ff-only`
2. `docker compose down`
3. `docker compose up -d --build`
4. `docker compose ps`

### 4. Проверка

1. `docker compose ps` — все контейнеры должны быть Up
2. `docker compose logs --tail=20 backend` — нет ошибок в логах

### 5. Отчёт

Покажи пользователю итог:
- Что задеплоено (коммиты)
- Статус контейнеров
- Проблемы (если были)

## Особенности

- `.env` файл в `.gitignore` — не пушится. Новые переменные добавлять вручную в `/srv/ai-chalange/first-lesson/.env`
- `ADMIN_PASSWORD_HASH` в `.env` на сервере использует `$$` вместо `$` (экранирование для docker-compose)
- Backend Dockerfile: multi-stage build (node:20-alpine)
- Frontend Dockerfile: 3-stage build, `NEXT_PUBLIC_API_URL` передаётся как build arg из docker-compose.yml
