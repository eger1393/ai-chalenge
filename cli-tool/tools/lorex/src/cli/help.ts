export function renderHelp(): string {
  return `lorex — локальный RAG-поиск по проектной документации

Использование:
  lorex init [--project-root <path>] [--force] [--folders <a,b>]
  lorex index [--project-root <path>]
  lorex query <question> [--project-root <path>] [--format markdown|json] [--max-chunks <n>]
  lorex status [--project-root <path>]
  lorex auth status

Команды:
  init      Создать .lorex/config.json и добавить .lorex/ в .gitignore
  index     Обойти документы, обновить manifest, SQLite, FTS и embeddings
  query     Выполнить hybrid retrieval: FTS/BM25 + vector search
  status    Проверить наличие и валидность конфига
  auth      Проверить наличие OPENAI_API_KEY в окружении или локальном .env

Security:
  OPENAI_API_KEY не хранится в config.json. Передавайте ключ через окружение или .env.
  Для index/query с embeddings нужен OPENAI_API_KEY в окружении или .env директории запуска.
  Проверьте настройку через: lorex auth status
  Не используйте folders="."; задавайте явные папки с документацией.
`;
}
