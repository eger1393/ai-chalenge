# Deploy: first-lesson

## Сервер

- **Хост:** `algorana-stage` (IP: `167.235.226.104`, порт SSH: `2222`, user: `root`)
- **Репозиторий на сервере:** `/srv/ai-chalange` (ветка `develop`)
- **Директория проекта:** `/srv/ai-chalange/first-lesson`
- **Скрипт деплоя:** `/srv/ai-chalange/update.sh`

## Порты на сервере

| Сервис   | Внутренний порт | Внешний порт |
| -------- | --------------- | ------------ |
| Backend  | 3000            | 6500         |
| Frontend | 3000            | 6501         |

## URL-ы на сервере

- Frontend: `http://167.235.226.104:6501`
- Backend API: `http://167.235.226.104:6500/api`

## Процедура деплоя

### Шаг 1: Коммит и пуш

```bash
# Локально, в директории first-lesson
git add <файлы>
git commit -m "описание изменений"
git push origin develop
```

**ВАЖНО:** `.env` файл в .gitignore — он НЕ пушится. Если в .env появились новые переменные, их нужно добавить вручную на сервере в `/srv/ai-chalange/first-lesson/.env`.

### Шаг 2: Подключение к серверу

Через SSH MCP:
```
host: 167.235.226.104
username: root
port: 2222
auth: key
privateKeyPath: C:\Users\eger1\.ssh\main_key
```

### Шаг 3: Запуск скрипта деплоя

```bash
cd /srv/ai-chalange && bash update.sh first-lesson
```

### Шаг 4: Проверка

```bash
cd /srv/ai-chalange/first-lesson && docker compose ps
```

Оба контейнера должны быть в статусе `Up`.

## Что делает update.sh

1. `git pull --ff-only` — подтягивает последние изменения из origin (fast-forward only, не мержит)
2. `docker compose down` — останавливает и удаляет контейнеры
3. `docker compose up -d --build` — пересобирает образы и запускает контейнеры
4. `docker compose ps` — показывает статус

## Особенности сборки

- **Backend Dockerfile:** multi-stage build (node:20-alpine), `npm ci` → `npm run build` → запуск `dist/main`
- **Frontend Dockerfile:** 3-stage build, `NEXT_PUBLIC_API_URL` передаётся как build arg из docker-compose.yml (значение: `http://167.235.226.104:6500/api`)
- **docker-compose.yml:** backend env подтягивается из `.env` файла на сервере

## Когда нужны ручные действия на сервере

| Ситуация | Действие |
| --- | --- |
| Новая переменная в .env | Добавить вручную в `/srv/ai-chalange/first-lesson/.env` |
| Изменился FRONTEND_URL в .env | Обновить и в `.env` поле `FRONTEND_URL`, и в `docker-compose.yml` build arg `NEXT_PUBLIC_API_URL` |
| git pull конфликт (не fast-forward) | Зайти в `/srv/ai-chalange`, resolve вручную или `git reset --hard origin/develop` |
| Нужно посмотреть логи | `cd /srv/ai-chalange/first-lesson && docker compose logs -f --tail=50` |
| Перезапуск без ребилда | `cd /srv/ai-chalange/first-lesson && docker compose restart` |

## .env на сервере (шаблон)

`.env` на сервере отличается от локального:
- `FRONTEND_URL` указывает на внешний IP: `http://167.235.226.104:6501`
- `ADMIN_PASSWORD_HASH` использует `$$` вместо `$` (экранирование для docker-compose)
