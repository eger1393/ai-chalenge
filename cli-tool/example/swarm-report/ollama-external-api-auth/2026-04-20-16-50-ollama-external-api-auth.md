# Отчёт по задаче: внешний доступ к `Ollama API` с авторизацией

## Краткое описание задачи

Настроить доступ к `Ollama API` на хосте `superlook-gpu-dev` снаружи и защитить
его простой авторизацией по API-ключу.

## Что реализовано на хосте

Собран защищённый внутренний контур:

- `Ollama` остаётся на `127.0.0.1:11434`
- добавлен bridge-прокси через `systemd-socket-proxyd`:
  - `172.20.0.1:11435` -> `127.0.0.1:11434`
- добавлен отдельный auth-сервис по API-ключу:
  - `172.20.0.1:11436/auth`
- `Traefik` настроен на маршрут `/ollama`
- авторизация сделана через `Traefik forwardAuth`
- запрос без ключа даёт `401`
- запрос с корректным `X-API-Key` даёт `200`

### Созданные или изменённые файлы на сервере

- `/etc/systemd/system/ollama-bridge.socket`
- `/etc/systemd/system/ollama-bridge.service`
- `/opt/ollama-api-auth/server.py`
- `/etc/ollama-api-auth.env`
- `/etc/systemd/system/ollama-api-auth.service`
- `/srv/cloudflared-tunnel/traefik/configs/ollama-api.yml`

## Что проверено

Проверки на самом сервере прошли:

- `curl http://127.0.0.1:11434/api/version` -> `200`
- через `Traefik` без ключа -> `401`
- через `Traefik` с `X-API-Key` -> `200`
- локальная сквозная проверка с `Host: dev-neuroapp-server.superlook.ai` ->
  `200`

## Блокер внешнего доступа

Полностью подтвердить внешний доступ не удалось из-за внешнего edge-контура,
который не управляется локально с этого хоста:

- прямой `http://213.207.149.6` и `https://213.207.149.6` из текущей внешней
  сети устанавливают TCP-соединение, но не получают HTTP/TLS-ответ
- hostname `dev-neuroapp-server.superlook.ai` обслуживается через
  `Cloudflare Tunnel`, но его ingress сейчас указывает на другой origin, а не
  на текущий `Traefik`-маршрут `/ollama`

Итог:

- защищённый маршрут и авторизация внутри хоста готовы
- фактический публичный внешний вход требует отдельной настройки edge:
  либо корректного port-forward / reverse-proxy на публичный IP,
  либо изменения ingress в `Cloudflare Tunnel`

## Практически готовый контракт

После исправления внешнего edge-контра endpoint уже готов в таком виде:

- путь: `/ollama/api/...`
- авторизация: заголовок `X-API-Key`

Пример:

```bash
curl -H 'X-API-Key: <секрет>' https://<внешний-хост>/ollama/api/version
```

## Статус

Частично
