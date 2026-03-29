import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { OpenAIService } from './openai.service';

export interface ConversationFact {
  id: string;
  conversation_id: string;
  fact_key: string;
  fact_value: string;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FactsDiff {
  upsert: Array<{ key: string; value: string }>;
  remove: string[];
}

@Injectable()
export class FactsService {
  private readonly logger = new Logger(FactsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly openaiService: OpenAIService,
  ) {}

  async getFacts(conversationId: string): Promise<ConversationFact[]> {
    const { rows } = await this.db.query(
      'SELECT * FROM conversation_facts WHERE conversation_id = $1 ORDER BY fact_key ASC',
      [conversationId],
    );
    return rows;
  }

  async setFact(conversationId: string, key: string, value: string, sourceMessageId?: string): Promise<ConversationFact> {
    const { rows } = await this.db.query(
      `INSERT INTO conversation_facts (id, conversation_id, fact_key, fact_value, source_message_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (conversation_id, fact_key)
       DO UPDATE SET fact_value = EXCLUDED.fact_value, source_message_id = EXCLUDED.source_message_id, updated_at = NOW()
       RETURNING *`,
      [conversationId, key, value, sourceMessageId || null],
    );
    return rows[0];
  }

  async deleteFact(conversationId: string, key: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      'DELETE FROM conversation_facts WHERE conversation_id = $1 AND fact_key = $2',
      [conversationId, key],
    );
    return (rowCount ?? 0) > 0;
  }

  async extractFactsFromMessage(
    conversationId: string,
    userMessage: string,
    assistantReply: string,
    existingFacts: ConversationFact[],
  ): Promise<FactsDiff> {
    const existingFactsText = existingFacts.length > 0
      ? existingFacts.map(f => `- ${f.fact_key}: ${f.fact_value}`).join('\n')
      : '(нет фактов)';

    const prompt = `Ты — экстрактор фактов из диалога. Твоя задача — извлечь ключевые факты, которые стоит запомнить на будущее.

Существующие факты:
${existingFactsText}

Последнее сообщение пользователя:
${userMessage}

Ответ ассистента:
${assistantReply}

Проанализируй диалог и верни JSON с изменениями фактов:
{
  "upsert": [{"key": "краткий_ключ", "value": "значение факта"}],
  "remove": ["ключ_устаревшего_факта"]
}

Правила:
- Ключ — короткое описание (до 200 символов), snake_case или на русском
- Значение — краткое, информативное
- Добавляй только действительно важные факты (имена, предпочтения, решения, технические детали)
- Удаляй факты, которые опровергнуты или устарели
- Если нет изменений — верни {"upsert": [], "remove": []}
- Верни ТОЛЬКО валидный JSON, без пояснений`;

    try {
      const response = await this.openaiService.callOpenAI(
        'gpt-4.1-nano',
        [
          { role: 'system', content: 'Ты извлекаешь факты из диалога. Отвечай ТОЛЬКО валидным JSON.' },
          { role: 'user', content: prompt },
        ],
        0.2,
        1024,
      );

      const content = response.choices?.[0]?.message?.content || '{"upsert":[],"remove":[]}';

      // Parse JSON, handling possible markdown code blocks
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const diff: FactsDiff = JSON.parse(jsonStr);

      // Validate structure
      if (!Array.isArray(diff.upsert)) diff.upsert = [];
      if (!Array.isArray(diff.remove)) diff.remove = [];

      return diff;
    } catch (error) {
      this.logger.warn(`Failed to extract facts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { upsert: [], remove: [] };
    }
  }

  async applyFactsDiff(conversationId: string, diff: FactsDiff, sourceMessageId?: string): Promise<void> {
    for (const item of diff.upsert) {
      if (item.key && item.value) {
        await this.setFact(conversationId, item.key.slice(0, 200), item.value, sourceMessageId);
      }
    }

    for (const key of diff.remove) {
      if (key) {
        await this.deleteFact(conversationId, key);
      }
    }
  }
}
