import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../ai/openai.service';
import { RAG_QUERY_REWRITE_MAX_TOKENS, RAG_QUERY_REWRITE_MODEL } from './constants';

export interface RagQueryRewriteResult {
  model: string;
  originalQuery: string;
  rewrittenQuery: string;
  applied: boolean;
}

@Injectable()
export class RagQueryRewriteService {
  private readonly logger = new Logger(RagQueryRewriteService.name);

  constructor(private readonly openaiService: OpenAIService) {}

  async rewrite(query: string, traceId: string): Promise<RagQueryRewriteResult> {
    this.logger.log(
      `[${traceId}] Query rewrite start ${JSON.stringify({
        model: RAG_QUERY_REWRITE_MODEL,
        queryChars: query.length,
        queryPreview: truncateForLog(query),
      })}`,
    );

    const response = await this.openaiService.callOpenAI(
      RAG_QUERY_REWRITE_MODEL,
      [
        {
          role: 'system',
          content:
            'Ты переписываешь пользовательский запрос в формулировку для RAG-поиска. ' +
            'Не отвечай на вопрос. Сохраняй язык запроса, сущности, имена и технические термины. ' +
            'Если запрос уже подходит для поиска или без контекста неоднозначен, верни его без изменений. ' +
            'Отвечай только валидным JSON вида {"query":"..."} без пояснений.',
        },
        {
          role: 'user',
          content:
            `Исходный запрос:\n${query}\n\n` +
            'Перепиши его в короткую поисковую формулировку для retrieval по базе сообщений.\n' +
            'Примеры преобразования:\n' +
            '- "что автор знает о мире Гарри Поттера?" -> "что автор писал про Гарри Поттера"\n' +
            '- "а он что про это говорил?" -> верни исходный запрос, если без внешнего контекста непонятно, о чём речь\n' +
            '- "claude code и реверс-инжиниринг" -> можно вернуть почти без изменений\n\n' +
            'Верни только JSON.',
        },
      ],
      0,
      RAG_QUERY_REWRITE_MAX_TOKENS,
    );

    const rawContent = response.choices?.[0]?.message?.content?.trim();
    if (!rawContent) {
      throw new BadGatewayException('RAG query rewrite returned empty response');
    }

    const parsed = parseRewriteResponse(rawContent);
    const rewrittenQuery = parsed.query.trim();

    if (!rewrittenQuery) {
      throw new BadGatewayException('RAG query rewrite returned empty query');
    }

    const applied = rewrittenQuery !== query;
    this.logger.log(
      `[${traceId}] Query rewrite result ${JSON.stringify({
        model: RAG_QUERY_REWRITE_MODEL,
        applied,
        originalQueryPreview: truncateForLog(query),
        rewrittenQueryPreview: truncateForLog(rewrittenQuery),
      })}`,
    );

    return {
      model: RAG_QUERY_REWRITE_MODEL,
      originalQuery: query,
      rewrittenQuery,
      applied,
    };
  }
}

function parseRewriteResponse(rawContent: string): { query: string } {
  const normalized = rawContent.startsWith('```')
    ? rawContent.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')
    : rawContent;

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new BadGatewayException(
      `RAG query rewrite returned invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadGatewayException('RAG query rewrite returned invalid payload shape');
  }

  const query = (parsed as Record<string, unknown>).query;
  if (typeof query !== 'string') {
    throw new BadGatewayException('RAG query rewrite payload does not contain string field "query"');
  }

  return { query };
}

function truncateForLog(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}
