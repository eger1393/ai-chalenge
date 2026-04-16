import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../ai/openai.service';
import { RAG_QUERY_REWRITE_MAX_TOKENS, RAG_QUERY_REWRITE_MODEL } from './constants';
import type { RagQueryRewriteReason } from './rag.types';

export interface RagQueryRewriteResult {
  model: string;
  originalQuery: string;
  rewrittenQuery: string;
  applied: boolean;
  rawApplied: boolean;
  reason: RagQueryRewriteReason;
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
            'Ты переписываешь пользовательский запрос в короткую формулировку для RAG-поиска. ' +
            'Не отвечай на вопрос и не добавляй новые факты. ' +
            'Твоя задача: убрать разговорный шум, нормализовать сленг, канонизировать имена продуктов и сущностей и оставить только поисковое намерение. ' +
            'Сохраняй основной язык запроса, но если у сущности есть общепринятое каноническое имя на английском, используй его. ' +
            'Запрос без изменений можно оставлять только в двух случаях: он уже короткий и поисковый, либо без контекста реально нельзя снять неоднозначность. ' +
            'Отвечай только валидным JSON вида {"query":"...","applied":true,"reason":"normalized_colloquial"} без пояснений.',
        },
        {
          role: 'user',
          content:
            `Исходный запрос:\n${query}\n\n` +
            'Перепиши его в короткую поисковую формулировку для retrieval по базе сообщений.\n' +
            'Правила:\n' +
            '- Убирай разговорные вставки, междометия и лишние слова\n' +
            '- Нормализуй сленг и просторечие: "че-каво", "траблы", "что не так", "фигня", "почему ломается"\n' +
            '- Канонизируй продукты и сущности: "клод код" и "клауд код" -> "Claude Code"\n' +
            '- Для вопросов про мнение, знание, опыт или проблемы превращай запрос в retrieval-friendly формулировку\n' +
            '- Не оставляй no-op, если смысл понятен и запрос можно сделать более поисковым\n' +
            '- Поле "reason" обязано быть одним из: normalized_colloquial, canonicalized_entity, clarified_intent, already_search_friendly, ambiguous_without_context\n' +
            '\n' +
            'Примеры преобразования:\n' +
            '- "че-каво, какие траблы с клод кодом были?" -> {"query":"какие проблемы были с Claude Code","applied":true,"reason":"normalized_colloquial"}\n' +
            '- "что не так с клауд код?" -> {"query":"какие проблемы были с Claude Code","applied":true,"reason":"canonicalized_entity"}\n' +
            '- "что автор знает о мире Гарри Поттера?" -> {"query":"что автор писал про Гарри Поттера","applied":true,"reason":"clarified_intent"}\n' +
            '- "что автор писал про Гарри Поттера" -> {"query":"что автор писал про Гарри Поттера","applied":false,"reason":"already_search_friendly"}\n' +
            '- "а он что про это говорил?" -> {"query":"а он что про это говорил?","applied":false,"reason":"ambiguous_without_context"}\n' +
            '- "Claude Code context window" -> {"query":"Claude Code context window","applied":false,"reason":"already_search_friendly"}\n\n' +
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

    if (parsed.applied && rewrittenQuery === query) {
      throw new BadGatewayException('RAG query rewrite returned applied=true but did not change the query');
    }

    if (!parsed.applied && rewrittenQuery !== query) {
      throw new BadGatewayException('RAG query rewrite returned applied=false but changed the query');
    }

    const applied = parsed.applied;
    this.logger.log(
      `[${traceId}] Query rewrite result ${JSON.stringify({
        model: RAG_QUERY_REWRITE_MODEL,
        applied,
        rawApplied: parsed.applied,
        reason: parsed.reason,
        originalQueryPreview: truncateForLog(query),
        rewrittenQueryPreview: truncateForLog(rewrittenQuery),
      })}`,
    );

    return {
      model: RAG_QUERY_REWRITE_MODEL,
      originalQuery: query,
      rewrittenQuery,
      applied,
      rawApplied: parsed.applied,
      reason: parsed.reason,
    };
  }
}

function parseRewriteResponse(rawContent: string): {
  query: string;
  applied: boolean;
  reason: RagQueryRewriteReason;
} {
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
  const applied = (parsed as Record<string, unknown>).applied;
  const reason = (parsed as Record<string, unknown>).reason;
  if (typeof query !== 'string') {
    throw new BadGatewayException('RAG query rewrite payload does not contain string field "query"');
  }

  if (typeof applied !== 'boolean') {
    throw new BadGatewayException('RAG query rewrite payload does not contain boolean field "applied"');
  }

  if (!isRewriteReason(reason)) {
    throw new BadGatewayException('RAG query rewrite payload does not contain valid field "reason"');
  }

  return { query, applied, reason };
}

function isRewriteReason(value: unknown): value is RagQueryRewriteReason {
  return (
    value === 'normalized_colloquial' ||
    value === 'canonicalized_entity' ||
    value === 'clarified_intent' ||
    value === 'already_search_friendly' ||
    value === 'ambiguous_without_context'
  );
}

function truncateForLog(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}
