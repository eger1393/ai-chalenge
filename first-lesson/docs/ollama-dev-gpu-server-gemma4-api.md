# API `dev-gpu-server.superlook.ai` для `gemma4:31b`

Проверено `20 апреля 2026 года` на сервере `superlook-gpu-dev` с `Ollama 0.21.0`.

## Контур

- Базовый адрес: `https://dev-gpu-server.superlook.ai`
- Обязательный заголовок маршрутизации: `X-GPU-Service: ollama`
- Авторизация шлюза: либо `X-API-Key: <OLLAMA_API_KEY>`, либо `Authorization: Bearer <OLLAMA_API_KEY>`
- Текущая модель по умолчанию: `gemma4:31b`

Минимальная проверка:

```bash
curl https://dev-gpu-server.superlook.ai/api/version \
  -H 'X-GPU-Service: ollama' \
  -H 'X-API-Key: <OLLAMA_API_KEY>'
```

## Что реально поддерживает текущая модель

- Текстовая генерация и чат: да
- Размышления через `think`: да, проверено на `POST /api/chat`
- Вызов инструментов через `tools`: да, проверено на `POST /api/chat`
- Структурированный JSON через `format: "json"`: да, проверено на `POST /api/chat`
- Входные изображения: да, у модели заявлена возможность `vision`
- OpenAI-совместимый контур `/v1`: да, проверен на `GET /v1/models` и `POST /v1/chat/completions`
- Эмбеддинги: нет для `gemma4:31b`, нужна отдельная модель эмбеддингов
- Аудиовход: нет для `Gemma 4 31B Dense`
- Генерация изображений: нет

## Практические ограничения текущего запуска

- Архитектурный лимит контекста модели: `262144` токенов
- В текущем рабочем запуске `GET /api/ps` показывает `context_length: 32768`
- В том же снимке `size_vram` был около `24.36 GiB`, то есть длинный контекст быстро съедает VRAM на одной `RTX 4090`

Практический вывод: для обычного чата, кода и вызова инструментов используй умеренный `num_ctx`, а к верхней границе контекста относись как к теоретическому максимуму модели, а не как к бесплатному режиму на текущем железе.

## Рекомендуемый основной API: `/api`

### `GET /api/version`

Что делает:

- Возвращает версию `Ollama`

Параметры:

- Нет

Пример:

```bash
curl https://dev-gpu-server.superlook.ai/api/version \
  -H 'X-GPU-Service: ollama' \
  -H 'X-API-Key: <OLLAMA_API_KEY>'
```

### `GET /api/tags`

Что делает:

- Возвращает список доступных локальных моделей на сервере

Параметры:

- Нет

Когда полезен:

- Проверить, что `gemma4:31b` действительно установлена
- Узнать формат, семейство и уровень квантизации

### `GET /api/ps`

Что делает:

- Показывает модели, которые сейчас загружены в память

Параметры:

- Нет

Когда полезен:

- Смотреть, загружена ли `gemma4:31b`
- Смотреть текущий `context_length`
- Смотреть фактическое потребление `size_vram`

### `POST /api/show`

Что делает:

- Возвращает метаданные модели и её capabilities

Параметры тела:

- `model` — обязательный, имя модели
- `verbose` — необязательный, включает более подробные поля

Практический пример:

```bash
curl https://dev-gpu-server.superlook.ai/api/show \
  -H 'Content-Type: application/json' \
  -H 'X-GPU-Service: ollama' \
  -H 'X-API-Key: <OLLAMA_API_KEY>' \
  -d '{
    "model": "gemma4:31b"
  }'
```

### `POST /api/chat`

Это основной эндпоинт для `gemma4:31b` в твоём контуре.

Подходит для:

- обычного многосообщенческого чата
- системного промпта
- размышлений через `think`
- вызова инструментов
- структурированного JSON-ответа

Параметры тела, которые стоит использовать с `gemma4:31b`:

- `model` — обязательный, у тебя это обычно `gemma4:31b`
- `messages` — обязательный массив сообщений
- `tools` — список функций, которые модель может вызвать
- `format` — `"json"` или JSON Schema object для структурированного вывода
- `options` — параметры генерации
- `stream` — потоковый или обычный ответ
- `think` — `true` или `false`; на этой модели работает
- `keep_alive` — например `"5m"` или `0`
- `logprobs` — вернуть логвероятности токенов
- `top_logprobs` — сколько верхних токенов вернуть при `logprobs: true`

Сообщения в `messages`:

- Для обычного диалога используй роли `system`, `user`, `assistant`
- Для инструмента после `tool_calls` продолжай диалог по обычному циклу вызова инструмента в своём клиенте

Документированные runtime-параметры внутри `options`, которые уместны для текущей модели:

- `num_ctx`
- `repeat_last_n`
- `repeat_penalty`
- `temperature`
- `seed`
- `stop`
- `num_predict`
- `top_k`
- `top_p`
- `min_p`

Что важно именно для `gemma4:31b`:

- `think: true` реально возвращает `message.thinking`
- `tools` реально возвращает `message.tool_calls`
- `format: "json"` реально работает
- Для строгого JSON лучше держать невысокую температуру, например `0` или `0.2`

Пример обычного чата:

```bash
curl https://dev-gpu-server.superlook.ai/api/chat \
  -H 'Content-Type: application/json' \
  -H 'X-GPU-Service: ollama' \
  -H 'X-API-Key: <OLLAMA_API_KEY>' \
  -d '{
    "model": "gemma4:31b",
    "messages": [
      {
        "role": "system",
        "content": "Отвечай кратко и по делу"
      },
      {
        "role": "user",
        "content": "Что такое RAG?"
      }
    ],
    "stream": false,
    "think": false,
    "options": {
      "temperature": 0.2,
      "num_ctx": 8192,
      "num_predict": 256
    }
  }'
```

Пример с размышлениями:

```bash
curl https://dev-gpu-server.superlook.ai/api/chat \
  -H 'Content-Type: application/json' \
  -H 'X-GPU-Service: ollama' \
  -H 'X-API-Key: <OLLAMA_API_KEY>' \
  -d '{
    "model": "gemma4:31b",
    "messages": [
      {
        "role": "user",
        "content": "Верни только слово OK"
      }
    ],
    "stream": false,
    "think": true
  }'
```

Пример с инструментом:

```bash
curl https://dev-gpu-server.superlook.ai/api/chat \
  -H 'Content-Type: application/json' \
  -H 'X-GPU-Service: ollama' \
  -H 'X-API-Key: <OLLAMA_API_KEY>' \
  -d '{
    "model": "gemma4:31b",
    "messages": [
      {
        "role": "user",
        "content": "Какая погода в Москве? Если нужен инструмент, используй его."
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Возвращает погоду",
          "parameters": {
            "type": "object",
            "properties": {
              "city": {
                "type": "string"
              }
            },
            "required": ["city"]
          }
        }
      }
    ],
    "stream": false
  }'
```

Пример со структурированным JSON:

```bash
curl https://dev-gpu-server.superlook.ai/api/chat \
  -H 'Content-Type: application/json' \
  -H 'X-GPU-Service: ollama' \
  -H 'X-API-Key: <OLLAMA_API_KEY>' \
  -d '{
    "model": "gemma4:31b",
    "messages": [
      {
        "role": "user",
        "content": "Верни JSON с полем status и значением ok"
      }
    ],
    "format": "json",
    "stream": false,
    "options": {
      "temperature": 0
    }
  }'
```

### `POST /api/generate`

Этот эндпоинт подходит для одноразовой генерации без явной истории сообщений.

Подходит для:

- одноразового запроса по текстовому промпту
- системного промпта
- JSON-вывода
- размышлений через `think`
- мультимодального запроса с изображениями через поле `images`

Параметры тела, которые уместны для `gemma4:31b`:

- `model` — обязательный
- `prompt` — обязательный
- `images` — массив base64-картинок для vision-запросов
- `format` — `"json"` или JSON Schema object
- `system`
- `stream`
- `think`
- `raw`
- `keep_alive`
- `options`
- `logprobs`
- `top_logprobs`

Поля, которые глобально есть в `Ollama`, но я не рекомендую закладывать в интеграцию под текущую модель без отдельной проверки:

- `suffix` — это сценарий fill-in-the-middle; для твоего текущего контура с `gemma4:31b` он не нужен и отдельно не валидировался

Пример:

```bash
curl https://dev-gpu-server.superlook.ai/api/generate \
  -H 'Content-Type: application/json' \
  -H 'X-GPU-Service: ollama' \
  -H 'X-API-Key: <OLLAMA_API_KEY>' \
  -d '{
    "model": "gemma4:31b",
    "prompt": "Коротко объясни, что такое вызов инструментов",
    "stream": false,
    "think": false,
    "options": {
      "temperature": 0.2,
      "num_predict": 256
    }
  }'
```

## Служебные нативные эндпоинты, которые у тебя тоже доступны

Эти эндпоинты проходят через тот же публичный адрес, но они относятся уже не к обычному вызову `gemma4:31b`, а к управлению моделями на сервере.

### `POST /api/create`

Параметры тела:

- `model` — обязательный, новое имя модели
- `from` — базовая модель
- `template`
- `license`
- `system`
- `parameters`
- `messages`
- `quantize`
- `stream`

Когда использовать:

- Если хочешь сделать производную модель-обёртку от `gemma4:31b` с другим `SYSTEM` или `PARAMETER num_ctx`

### `POST /api/copy`

Параметры тела:

- `source` — обязательный
- `destination` — обязательный

### `POST /api/pull`

Параметры тела:

- `model` — обязательный
- `insecure`
- `stream`

### `POST /api/push`

Параметры тела:

- `model` — обязательный
- `insecure`
- `stream`

### `DELETE /api/delete`

Параметры тела:

- `model` — обязательный

## Эндпоинты, которые есть у `Ollama`, но не подходят для текущей модели

### `POST /api/embed`

Почему не подходит:

- `gemma4:31b` не является моделью эмбеддингов

Параметры тела по документации:

- `model`
- `input`
- `truncate`
- `dimensions`
- `keep_alive`
- `options`

Что делать вместо этого:

- Использовать отдельную модель эмбеддингов, например из семейства `embeddinggemma` или другой специализированный вариант

### `POST /v1/embeddings`

Почему не подходит:

- Это OpenAI-совместимая обёртка вокруг сценария эмбеддингов, а не режим для `gemma4:31b`

### `POST /v1/images/generations`

Почему не подходит:

- `gemma4:31b` умеет принимать изображения на вход, но не является моделью генерации изображений

## OpenAI-совместимый API: `/v1`

Этот слой нужен, если клиент или SDK уже ожидает OpenAI-совместимый интерфейс.

Для твоего публичного адреса практически удобно так:

- `base_url = https://dev-gpu-server.superlook.ai/v1`
- `Authorization: Bearer <OLLAMA_API_KEY>`
- дополнительный заголовок `X-GPU-Service: ollama`

### `GET /v1/models`

Подходит:

- Да

Что делает:

- Показывает доступные модели в формате, похожем на OpenAI

### `POST /v1/chat/completions`

Подходит:

- Да, это лучший OpenAI-совместимый маршрут для `gemma4:31b`

Поддерживаемые возможности по официальной документации `Ollama`:

- Chat completions
- Streaming
- JSON mode
- Reproducible outputs
- Vision
- Tools
- Logprobs

Параметры запроса по официальной документации `Ollama`:

- `model`
- `messages`
- `frequency_penalty`
- `presence_penalty`
- `response_format`
- `seed`
- `stop`
- `stream`
- `stream_options`
- `temperature`
- `top_p`
- `max_tokens`
- `tools`
- `tool_choice`
- `logit_bias`
- `user`
- `n`

Практическая заметка по текущему серверу:

- В проверочном запросе ответ содержал `choices[0].message.reasoning`
- Я рассматриваю это как фактически наблюдаемое поведение текущей версии `Ollama 0.21.0`, а не как самый жёсткий публичный контракт OpenAI-совместимого слоя

Пример:

```bash
curl https://dev-gpu-server.superlook.ai/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <OLLAMA_API_KEY>' \
  -H 'X-GPU-Service: ollama' \
  -d '{
    "model": "gemma4:31b",
    "messages": [
      {
        "role": "user",
        "content": "Say OK"
      }
    ],
    "stream": false
  }'
```

### `POST /v1/completions`

Подходит:

- Частично

Когда имеет смысл:

- Если интеграция ожидает старый completions-интерфейс

Для обычного приложения с `gemma4:31b` лучше всё равно использовать `/api/chat` или `/v1/chat/completions`.

Параметры запроса по официальной документации `Ollama`:

- `model`
- `prompt`
- `frequency_penalty`
- `presence_penalty`
- `seed`
- `stop`
- `stream`
- `stream_options`
- `temperature`
- `top_p`
- `max_tokens`
- `suffix`
- `best_of`
- `echo`
- `logit_bias`
- `user`
- `n`

### `POST /v1/responses`

Подходит:

- Да, если клиент уже использует Responses API

Параметры запроса по официальной документации `Ollama`:

- `model`
- `input`
- `instructions`
- `tools`
- `stream`
- `temperature`
- `top_p`
- `max_output_tokens`
- `truncation`

Особенность:

- `Ollama` пишет, что состояние между запросами не поддерживается, то есть `previous_response_id` и `conversation` как устойчивый контракт с состоянием не работают
- Для thinking-моделей этот слой заявляет краткие сводки рассуждений

## Какой контракт брать в работу

Если пишешь свой бекенд или простой клиент под этот сервер:

- Бери `POST /api/chat` как основной маршрут

Если подключаешь готовый SDK под OpenAI:

- Бери `/v1/chat/completions`

Если нужна трасса рассуждений:

- На нативном API используй `think: true`
- На `/v1` ориентируйся на фактическое наличие `message.reasoning`, но считай это зависимым от версии `Ollama`

Если нужен JSON:

- На нативном API используй `format: "json"` или JSON Schema
- Держи низкую температуру

Если нужны инструменты:

- Используй `/api/chat` или `/v1/chat/completions`

Если нужен vision-вход:

- Модель это поддерживает
- Для нового кода проще использовать либо `POST /api/generate` с `images`, либо OpenAI-совместимый `/v1/chat/completions` с частями контента, содержащими изображение

## Источники

- `Ollama API` — <https://docs.ollama.com/api>
- `POST /api/generate` — <https://docs.ollama.com/api/generate>
- `POST /api/chat` — <https://docs.ollama.com/api/chat>
- `POST /api/embed` — <https://docs.ollama.com/api/embed>
- `GET /api/tags` — <https://docs.ollama.com/api/tags>
- `GET /api/ps` — <https://docs.ollama.com/api/ps>
- `POST /api/show` — <https://docs.ollama.com/api-reference/show-model-details>
- `POST /api/create` — <https://docs.ollama.com/api/create>
- `POST /api/copy` — <https://docs.ollama.com/api/copy>
- `POST /api/pull` — <https://docs.ollama.com/api/pull>
- `POST /api/push` — <https://docs.ollama.com/api/push>
- `DELETE /api/delete` — <https://docs.ollama.com/api/delete>
- `GET /api/version` — <https://docs.ollama.com/api-reference/get-version>
- `Thinking` — <https://docs.ollama.com/capabilities/thinking>
- `OpenAI compatibility` — <https://docs.ollama.com/api/openai-compatibility>
- `Gemma 4 library page` — <https://ollama.com/library/gemma4>

## Что проверено вручную в этом контуре

- `POST /api/chat` с `think: true`
- `POST /api/chat` с `tools`
- `POST /api/chat` с `format: "json"`
- `GET /api/ps`
- `GET /v1/models`
- `POST /v1/chat/completions`
