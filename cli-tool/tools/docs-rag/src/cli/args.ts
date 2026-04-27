import path from 'node:path';
import { normalizeSafeRelativePath } from '../infrastructure/fast-glob-document-discovery.js';

export class CliError extends Error {
  constructor(message: string, public readonly exitCode = 2) {
    super(message);
    this.name = 'CliError';
  }
}

export type CommandName = 'init' | 'index' | 'query' | 'status' | 'auth-status' | 'help';

export interface ParsedArgs {
  command: CommandName;
  projectRoot: string;
  force: boolean;
  folders?: string[];
  query?: string;
  format: 'markdown' | 'json';
  maxChunks: number;
}

export function parseArgs(argv: string[], cwd: string): ParsedArgs {
  const args = [...argv];
  const command = normalizeCommand(args);

  if (command === 'help') {
    return defaultArgs(command, cwd);
  }

  const parsed = defaultArgs(command, cwd);
  const queryParts: string[] = [];

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { ...parsed, command: 'help' };
    }

    if (arg === '--force') {
      parsed.force = true;
      continue;
    }

    if (arg === '--project-root') {
      parsed.projectRoot = resolveProjectRoot(readOptionValue(args, arg), cwd);
      continue;
    }

    if (arg === '--folders') {
      parsed.folders = parseFolders(readOptionValue(args, arg));
      continue;
    }

    if (arg === '--format') {
      parsed.format = parseFormat(readOptionValue(args, arg));
      continue;
    }

    if (arg === '--max-chunks') {
      parsed.maxChunks = parseMaxChunks(readOptionValue(args, arg));
      continue;
    }

    if (arg.startsWith('-')) {
      throw new CliError(`Неизвестная опция: ${arg}`);
    }

    if (command === 'query') {
      queryParts.push(arg);
      continue;
    }

    throw new CliError(`Неожиданный аргумент для команды ${command}: ${arg}`);
  }

  if (command === 'query') {
    parsed.query = queryParts.join(' ').trim();
  }

  if (command === 'query' && !parsed.query) {
    throw new CliError('Для команды query нужно передать текст запроса.');
  }

  return parsed;
}

function defaultArgs(command: CommandName, cwd: string): ParsedArgs {
  return {
    command,
    projectRoot: resolveProjectRoot('.', cwd),
    force: false,
    format: 'markdown',
    maxChunks: 8,
  };
}

function normalizeCommand(args: string[]): CommandName {
  const command = args.shift();

  if (!command || command === '--help' || command === '-h') {
    return 'help';
  }

  if (command === 'auth') {
    const subcommand = args.shift();
    if (subcommand === 'status') {
      return 'auth-status';
    }

    throw new CliError(`Неизвестная команда: auth ${subcommand ?? ''}`.trim());
  }

  if (command === 'init' || command === 'index' || command === 'query' || command === 'status') {
    return command;
  }

  throw new CliError(`Неизвестная команда: ${command}`);
}

function readOptionValue(args: string[], option: string): string {
  const value = args.shift();
  if (!value || value.startsWith('-')) {
    throw new CliError(`Опция ${option} требует значение.`);
  }

  return value;
}

function resolveProjectRoot(value: string, cwd: string): string {
  return path.resolve(cwd, value);
}

function parseFolders(value: string): string[] {
  const folders = value.split(',').map((folder) => folder.trim()).filter(Boolean);
  if (folders.length === 0 || folders.includes('.')) {
    throw new CliError('Опция --folders должна содержать явные папки, не ".".');
  }

  return folders.map((folder) => normalizeSafeRelativePath(folder, '--folders'));
}

function parseFormat(value: string): 'markdown' | 'json' {
  if (value === 'markdown' || value === 'json') {
    return value;
  }

  throw new CliError('Опция --format поддерживает только markdown или json.');
}

function parseMaxChunks(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError('Опция --max-chunks должна быть положительным целым числом.');
  }

  return parsed;
}
