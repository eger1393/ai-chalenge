import OpenAI from 'openai';
import type { EmbeddingProvider } from '../application/embed-chunks.js';
import { AppError } from '../application/errors.js';

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  async embedTexts(texts: string[], model: string): Promise<number[][]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AppError('OPENAI_API_KEY не задан. Передайте ключ через переменную окружения, не через config.json.', 'OPENAI_API_KEY_MISSING');
    }

    try {
      const client = new OpenAI({ apiKey });
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
