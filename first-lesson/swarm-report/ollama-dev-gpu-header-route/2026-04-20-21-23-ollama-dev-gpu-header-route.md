# Отчёт по задаче: внешний доступ к `Ollama` через `dev-gpu-server.superlook.ai`

## Краткое описание задачи

Использовать уже существующий хост `dev-gpu-server.superlook.ai`, который
смотрит на `Traefik`, и настроить маршрутизацию к `Ollama` по заголовкам.

## Что выяснено

- На хосте уже используется маршрутизация `Traefik` по заголовкам
  Пример найден в `/srv/flow-images/docker-compose.yaml` через
  `Header(\`x-app-flow\`, ...)`
- `Ollama` не запущен в Docker
- `Ollama` работает как `systemd`-сервис:
  `/usr/local/bin/ollama serve`
- Docker на хосте используется только для `Traefik` и `cloudflared-tunnel`

## Что реализовано

В конфиге `Traefik` на сервере добавлен новый маршрут:

- hostname: `dev-gpu-server.superlook.ai`
- селектор сервиса: заголовок `X-GPU-Service: ollama`
- авторизация: заголовок `X-API-Key`

При этом сохранён и предыдущий path-based маршрут `/ollama`.

Изменён файл на сервере:

- `/srv/cloudflared-tunnel/traefik/configs/ollama-api.yml`

## Контракт доступа

Рабочий запрос:

```bash
curl \
  -H 'X-GPU-Service: ollama' \
  -H 'X-API-Key: a8427b8356d63c7c61439fd32673f07497cdb984c5100347' \
  https://dev-gpu-server.superlook.ai/api/version
```

Ожидаемый ответ:

```json
{"version":"0.21.0"}
```

## Результаты проверки

Внешние проверки прошли:

- без `X-GPU-Service` -> `404`
- с `X-GPU-Service: ollama`, но без `X-API-Key` -> `401`
- с `X-GPU-Service: ollama` и корректным `X-API-Key` -> `200`
- сквозная локальная проверка на самом сервере через `Traefik` -> `200`

## Статус

Готово
