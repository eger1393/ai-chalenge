# Отчёт: ollama-31b-cpu-placement

- Дата: `2026-04-24 13:34`
- Статус: `Готово`

## Краткое описание задачи

Проверить на `superlook-gpu-dev`, что именно `Ollama` держит на CPU у
`gemma4:31b`.

## Что найдено

По runtime-логам `ollama.service` для `gemma4:31b`:

### При `KvSize=16384`

- `offloading 60 repeating layers to GPU`
- `offloading output layer to CPU`
- `offloaded 60/61 layers to GPU`
- `model weights`:
  - `CUDA0`: `16.3 GiB`
  - `CPU`: `3.3 GiB`
- `kv cache`:
  - `CUDA0`: `4.8 GiB`
- `compute graph`:
  - `CUDA0`: `349.8 MiB`
  - `CPU`: `10.5 MiB`

### Важный нюанс при `KvSize=4096`

Даже когда `ollama ps` показывает `100% GPU`, лог всё равно не означает нулевой
CPU footprint:

- `offloaded 61/61 layers to GPU`
- `model weights`:
  - `CUDA0`: `18.4 GiB`
  - `CPU`: `1.2 GiB`

То есть `100% GPU` у `ollama ps` означает, что все слои модели offload-нуты на
GPU, но не что вообще все runtime-данные исчезли с CPU.

## Практический вывод

Для `gemma4:31b` на этом сервере при рабочем `ctx=16384` на CPU уходит:

- output layer
- около `3.3 GiB` model weights
- около `10.5 MiB` compute graph

Точный список конкретных tensor names стандартные логи `Ollama` не раскрывают.
Они показывают уровень слоёв и агрегированный объём памяти, но не печатают
детальную разбивку по каждому tensor.

## Ограничения

- Проверка сделана по логам `ollama.service`, без кастомной debug-сборки рантайма
- Для точного перечня tensor-level размещения нужен более низкоуровневый debug
  контур, чем стандартный `Ollama` лог
