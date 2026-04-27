#!/usr/bin/env node
import { initConfig } from '../application/init-config.js';
import { indexDocuments } from '../application/index-documents.js';
import { loadConfig } from '../application/load-config.js';
import { queryDocuments } from '../application/query-documents.js';
import { AppError } from '../application/errors.js';
import { FastGlobDocumentDiscovery } from '../infrastructure/fast-glob-document-discovery.js';
import { FsConfigRepository } from '../infrastructure/fs-config-repository.js';
import { FsDocumentReader } from '../infrastructure/fs-document-reader.js';
import { FsManifestRepository } from '../infrastructure/fs-manifest-repository.js';
import { OpenAiEmbeddingProvider } from '../infrastructure/openai-embedding-provider.js';
import { SqliteChunkStorage } from '../infrastructure/sqlite-chunk-storage.js';
import { formatJsonResults, formatMarkdownResults } from '../presentation/format-results.js';
import { CliError, parseArgs } from './args.js';
import { renderHelp } from './help.js';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const repository = new FsConfigRepository();

  switch (args.command) {
    case 'help':
      console.log(renderHelp());
      return;
    case 'init': {
      const result = await initConfig(repository, {
        projectRoot: args.projectRoot,
        force: args.force,
        folders: args.folders,
      });
      console.log(`${result.overwritten ? 'Обновлён' : 'Создан'} конфиг: ${result.configPath}`);
      console.log(`Папки документации: ${result.folders.join(', ')}`);
      console.log('Добавлено правило .docs-rag/ в .gitignore при необходимости.');
      return;
    }
    case 'status': {
      const config = await loadConfig(repository, args.projectRoot);
      console.log('docs-rag config: OK');
      console.log(`Project root: ${args.projectRoot}`);
      console.log(`Folders: ${config.folders.join(', ')}`);
      console.log(`Index dir: ${config.indexDir}`);
      return;
    }
    case 'auth-status': {
      if (process.env.OPENAI_API_KEY) {
        console.log('OPENAI_API_KEY: configured');
        console.log('Ключ найден в окружении. Значение не выводится из соображений безопасности.');
      } else {
        console.log('OPENAI_API_KEY: missing');
        console.log('Настройте ключ один раз в shell-сессии:');
        console.log('  export OPENAI_API_KEY="sk-..."');
        console.log('Для постоянной настройки добавьте эту строку в ~/.bashrc или ~/.zshrc.');
      }
      return;
    }
    case 'index': {
      const config = await loadConfig(repository, args.projectRoot);
      const result = await indexDocuments(
        new FastGlobDocumentDiscovery(),
        new FsManifestRepository(),
        new FsDocumentReader(),
        new SqliteChunkStorage(),
        new OpenAiEmbeddingProvider(),
        args.projectRoot,
        config,
      );
      console.log(`Manifest: ${result.manifestPath}`);
      console.log(`Index: ${result.indexPath}`);
      console.log(`Documents: ${result.total}`);
      console.log(`Chunks: ${result.chunkCount}`);
      console.log(`Embeddings generated: ${result.embeddedCount}`);
      console.log(`Added: ${result.diff.added.length}`);
      console.log(`Changed: ${result.diff.changed.length}`);
      console.log(`Unchanged: ${result.diff.unchanged.length}`);
      console.log(`Removed: ${result.diff.removed.length}`);
      return;
    }
    case 'query':
    {
      const config = await loadConfig(repository, args.projectRoot);
      const results = await queryDocuments(new SqliteChunkStorage(), new OpenAiEmbeddingProvider(), args.projectRoot, config, args.query ?? '', args.maxChunks);
      if (args.format === 'json') {
        console.log(formatJsonResults(args.query ?? '', results));
      } else {
        console.log(formatMarkdownResults(args.query ?? '', results));
      }
      return;
    }
  }
}

main().catch((error: unknown) => {
  if (error instanceof AppError) {
    console.error(error.message);
    process.exitCode = mapAppErrorToExitCode(error);
    return;
  }

  if (error instanceof CliError) {
    console.error(error.message);
    process.exitCode = error.exitCode;
    return;
  }

  console.error('Непредвиденная ошибка docs-rag. Запустите с корректными аргументами или проверьте конфиг.');
  process.exitCode = 1;
});

function mapAppErrorToExitCode(error: AppError): number {
  return error.code === 'CONFIG_EXISTS'
    || error.code === 'INVALID_CONFIG'
    || error.code === 'INVALID_JSON'
    || error.code === 'CONFIG_NOT_FOUND'
    || error.code === 'DEFAULT_FOLDERS_NOT_FOUND'
    || error.code === 'INVALID_MANIFEST'
    || error.code === 'UNSAFE_PATH'
    || error.code === 'INDEX_NOT_FOUND'
    || error.code === 'OPENAI_API_KEY_MISSING'
    || error.code === 'OPENAI_EMBEDDINGS_FAILED'
    ? 2
    : 1;
}
