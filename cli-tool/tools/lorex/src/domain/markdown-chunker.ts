import { createHash } from 'node:crypto';
import type { Chunk, SourceDocument } from './document.js';

interface MarkdownSection {
  headingPath: string[];
  lines: string[];
}

export interface ChunkingOptions {
  maxTokens: number;
  overlapTokens: number;
}

export function chunkMarkdownDocument(document: SourceDocument, options: ChunkingOptions): Chunk[] {
  const sections = splitIntoSections(document.content);
  const chunks: Chunk[] = [];

  for (const section of sections) {
    const content = section.lines.join('\n').trim();
    if (!content) {
      continue;
    }

    const parts = splitLargeContent(content, options);
    for (const part of parts) {
      const normalizedContent = part.trim();
      if (!normalizedContent) {
        continue;
      }

      const ordinal = chunks.length;
      const contentHash = sha256(normalizedContent);
      chunks.push({
        id: `${document.path}#${ordinal}-${contentHash.slice(0, 12)}`,
        documentPath: document.path,
        headingPath: section.headingPath,
        content: normalizedContent,
        contentHash,
        tokenCount: estimateTokens(normalizedContent),
        ordinal,
      });
    }
  }

  return chunks;
}

export function estimateTokens(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

function splitIntoSections(content: string): MarkdownSection[] {
  const lines = content.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  const headingStack: string[] = [];
  let current: MarkdownSection = { headingPath: [], lines: [] };
  let fencedCodeBlock = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      fencedCodeBlock = !fencedCodeBlock;
      current.lines.push(line);
      continue;
    }

    const heading = fencedCodeBlock ? undefined : parseHeading(line);

    if (heading) {
      pushSection(sections, current);
      headingStack.splice(heading.level - 1);
      headingStack[heading.level - 1] = heading.title;
      current = {
        headingPath: headingStack.filter(Boolean),
        lines: [line],
      };
      continue;
    }

    current.lines.push(line);
  }

  pushSection(sections, current);
  return sections;
}

function parseHeading(line: string): { level: number; title: string } | undefined {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if (!match) {
    return undefined;
  }

  return {
    level: match[1].length,
    title: match[2].trim(),
  };
}

function pushSection(sections: MarkdownSection[], section: MarkdownSection): void {
  if (section.lines.join('\n').trim()) {
    sections.push(section);
  }
}

function splitLargeContent(content: string, options: ChunkingOptions): string[] {
  const tokens = content.split(/\s+/).filter(Boolean);
  if (tokens.length <= options.maxTokens) {
    return [content];
  }

  const chunks: string[] = [];
  const step = Math.max(1, options.maxTokens - options.overlapTokens);

  for (let start = 0; start < tokens.length; start += step) {
    const end = Math.min(tokens.length, start + options.maxTokens);
    chunks.push(tokens.slice(start, end).join(' '));

    if (end >= tokens.length) {
      break;
    }
  }

  return chunks;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
