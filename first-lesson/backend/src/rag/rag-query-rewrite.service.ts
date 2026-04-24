import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { type AIProvider } from '../ai/dto/ai-params.dto';
import { OpenAIService } from '../ai/openai.service';
import { RAG_QUERY_REWRITE_MAX_TOKENS } from './constants';
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

  async rewrite(
    query: string,
    provider: AIProvider,
    model: string,
    traceId: string,
    contextHint?: string,
  ): Promise<RagQueryRewriteResult> {
    const messages = buildRewriteMessages(query, contextHint);

    this.logger.log(
      `[${traceId}] Query rewrite start ${JSON.stringify({
        provider,
        model,
        queryChars: query.length,
        queryPreview: truncateForLog(query),
      })}`,
    );

    const rawContent =
      provider === 'ollama'
        ? await this.callOllamaNativeRewrite(model, messages, traceId)
        : await this.callStandardRewrite(provider, model, messages);

    if (!rawContent) {
      throw new BadGatewayException('RAG query rewrite returned empty response');
    }

    const parsed = parseRewriteResponse(rawContent, query);
    const rewrittenQuery = parsed.query.trim();

    if (parsed.repaired) {
      this.logger.warn(
        `[${traceId}] Query rewrite payload repaired ${JSON.stringify({
          provider,
          model,
          reason: parsed.reason,
          rawContentPreview: truncateForLog(rawContent),
          rewrittenQueryPreview: truncateForLog(rewrittenQuery),
        })}`,
      );
    }

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
        provider,
        model,
        applied,
        rawApplied: parsed.applied,
        reason: parsed.reason,
        originalQueryPreview: truncateForLog(query),
        rewrittenQueryPreview: truncateForLog(rewrittenQuery),
      })}`,
    );

    return {
      model,
      originalQuery: query,
      rewrittenQuery,
      applied,
      rawApplied: parsed.applied,
      reason: parsed.reason,
    };
  }

  private async callStandardRewrite(
    provider: AIProvider,
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    const response = await this.openaiService.callOpenAI(
      model,
      messages,
      0,
      RAG_QUERY_REWRITE_MAX_TOKENS,
      undefined,
      provider,
      { responseFormat: { type: 'json_object' } },
    );

    return response.choices?.[0]?.message?.content?.trim() ?? '';
  }

  private async callOllamaNativeRewrite(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    traceId: string,
  ): Promise<string> {
    const response = await this.openaiService.callOllamaNativeChat(
      model,
      messages,
      0,
      RAG_QUERY_REWRITE_MAX_TOKENS,
      {
        think: false,
        format: 'json',
        keepAlive: '10m',
        numCtx: 4096,
        numPredict: RAG_QUERY_REWRITE_MAX_TOKENS,
      },
    );

    if (!response.content.trim() && response.thinking?.trim()) {
      this.logger.warn(
        `[${traceId}] Ollama native rewrite returned empty content with thinking ${JSON.stringify({
          doneReason: response.doneReason,
          thinkingPreview: truncateForLog(response.thinking),
        })}`,
      );
    }

    return response.content.trim();
  }
}

function parseRewriteResponse(rawContent: string, originalQuery: string): {
  query: string;
  applied: boolean;
  reason: RagQueryRewriteReason;
  repaired: boolean;
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

  const canonical = extractCanonicalPayload(parsed);
  if (canonical) {
    return canonical;
  }

  const repaired = repairRewritePayload(parsed, originalQuery);
  if (repaired) {
    return repaired;
  }

  throw new BadGatewayException('RAG query rewrite payload does not contain required fields');
}

function extractCanonicalPayload(parsed: unknown): {
  query: string;
  applied: boolean;
  reason: RagQueryRewriteReason;
  repaired: boolean;
} | null {
  const query = (parsed as Record<string, unknown>).query;
  const applied = (parsed as Record<string, unknown>).applied;
  const reason = (parsed as Record<string, unknown>).reason;
  if (typeof query !== 'string') {
    return null;
  }

  if (typeof applied !== 'boolean') {
    return null;
  }

  if (!isRewriteReason(reason)) {
    return null;
  }

  return { query, applied, reason, repaired: false };
}

function repairRewritePayload(
  parsed: unknown,
  originalQuery: string,
): {
  query: string;
  applied: boolean;
  reason: RagQueryRewriteReason;
  repaired: boolean;
} | null {
  const record = parsed as Record<string, unknown>;
  const query = extractCandidateQuery(record);
  if (!query) {
    return null;
  }

  const applied =
    typeof record.applied === 'boolean'
      ? record.applied
      : normalizeRewriteText(query) !== normalizeRewriteText(originalQuery);
  const reason = isRewriteReason(record.reason)
    ? record.reason
    : applied
      ? 'clarified_intent'
      : 'already_search_friendly';

  return {
    query,
    applied,
    reason,
    repaired: true,
  };
}

function extractCandidateQuery(record: Record<string, unknown>): string | null {
  const directCandidates = [
    record.query,
    record.rewrittenQuery,
    record.rewritten_query,
    record.searchQuery,
    record.search_query,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const arrayCandidates = [record.rewrittenQueries, record.rewritten_queries, record.queries];
  for (const candidate of arrayCandidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    const first = candidate.find((item) => typeof item === 'string' && item.trim());
    if (typeof first === 'string' && first.trim()) {
      return first.trim();
    }
  }

  return null;
}

function buildRewriteMessages(
  query: string,
  contextHint?: string,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return [
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
        (contextHint?.trim()
          ? `Дополнительный контекст диалога для снятия неоднозначности:\n${contextHint.trim()}\n\n`
          : '') +
        'Перепиши его в короткую поисковую формулировку для retrieval по базе сообщений.\n' +
        'Правила:\n' +
        '- Убирай разговорные вставки, междометия и лишние слова\n' +
        '- Нормализуй сленг и просторечие: "че-каво", "траблы", "что не так", "фигня", "почему ломается"\n' +
        '- Канонизируй продукты и сущности: "клод код" и "клауд код" -> "Claude Code"\n' +
        '- Используй дополнительный контекст только для снятия неоднозначности и выбора правильной темы поиска\n' +
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
  ];
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

function normalizeRewriteText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLowerCase();
}
