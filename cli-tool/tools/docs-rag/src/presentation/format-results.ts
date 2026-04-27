import type { SearchResult } from '../domain/search.js';

export function formatMarkdownResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `# Retrieved Documentation Context\n\nQuery: ${query}\n\nКонтекст не найден.\n\n# User Question\n${query}\n`;
  }

  const sources = results.map((result, index) => `## Source ${index + 1}
File: ${result.documentPath}
Heading: ${result.headingPath.join(' > ') || '(root)'}
Score: ${result.finalScore.toFixed(4)}
Lexical Score: ${formatOptionalScore(result.lexicalScore)}
Vector Score: ${formatOptionalScore(result.vectorScore)}

Content:
${result.content}`).join('\n\n');

  return `# Retrieved Documentation Context\n\nQuery: ${query}\n\n${sources}\n\n# User Question\n${query}\n`;
}

export function formatJsonResults(query: string, results: SearchResult[]): string {
  return JSON.stringify({ query, results }, null, 2);
}

function formatOptionalScore(score: number | undefined): string {
  return typeof score === 'number' ? score.toFixed(4) : 'n/a';
}
