export function renderHelp(): string {
  return `docs-rag — локальный RAG-поиск по проектной документации

Использование:
  docs-rag init [--project-root <path>] [--force] [--folders <a,b>]
  docs-rag index [--project-root <path>]
  docs-rag query <question> [--project-root <path>] [--format markdown|json] [--max-chunks <n>]
  docs-rag status [--project-root <path>]
  docs-rag auth status

Команды:
  init      Создать .docs-rag/config.json и добавить .docs-rag/ в .gitignore
  index     Обойти документы, обновить manifest, SQLite, FTS и embeddings
  query     Выполнить hybrid retrieval: FTS/BM25 + vector search
  status    Проверить наличие и валидность конфига
  auth      Проверить наличие OPENAI_API_KEY в окружении

Security:
  OPENAI_API_KEY не хранится в config.json. Передавайте ключ только через окружение.
  Для index/query с embeddings нужен OPENAI_API_KEY в окружении.
  Проверьте настройку через: docs-rag auth status
  Не используйте folders="."; задавайте явные папки с документацией.
`;
}
