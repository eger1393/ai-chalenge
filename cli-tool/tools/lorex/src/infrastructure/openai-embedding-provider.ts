import OpenAI from 'openai';
import type { EmbeddingProvider } from '../application/embed-chunks.js';
import { AppError } from '../application/errors.js';
import { resolveOpenAiApiKey } from './openai-api-key.js';

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  async embedTexts(texts: string[], model: string): Promise<number[][]> {
    const apiKey = await resolveOpenAiApiKey();
    if (!apiKey.key) {
      throw new AppError('OPENAI_API_KEY не задан. Передайте ключ через окружение или .env в директории запуска CLI.', 'OPENAI_API_KEY_MISSING');
    }

    try {
      const client = new OpenAI({ apiKey: apiKey.key });
      const response = await client.embeddings.create({
        model,
        input: texts,
      });

      return response.data
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Не удалось получить embeddings от OpenAI. Проверьте сеть, ключ и лимиты API.', 'OPENAI_EMBEDDINGS_FAILED');
    }
  }
}
