import { Injectable, Logger } from '@nestjs/common';
import * as path from 'node:path';
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { RAG_EMBEDDING_DIMENSION, RAG_RUNTIME_MODEL_ID } from './constants';

@Injectable()
export class RagEmbeddingService {
  private readonly logger = new Logger(RagEmbeddingService.name);
  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor() {
    env.allowRemoteModels = true;
    env.cacheDir = process.env.HF_HOME ?? path.resolve(process.cwd(), '.cache', 'huggingface');
  }

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractorPromise) {
      this.logger.log(`Загрузка embedding-модели ${RAG_RUNTIME_MODEL_ID}`);
      this.extractorPromise = pipeline('feature-extraction', RAG_RUNTIME_MODEL_ID, {
        dtype: 'fp32',
      }) as Promise<FeatureExtractionPipeline>;
    }

    return this.extractorPromise;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const extractor = await this.getExtractor();
    const tensor = await extractor(texts, {
      pooling: 'cls',
      normalize: true,
    });

    const rows = normalizeTensorRows(tensor.tolist());
    rows.forEach((row, index) => {
      if (row.length !== RAG_EMBEDDING_DIMENSION) {
        throw new Error(
          `Embedding длиной ${row.length} для элемента ${index} не совпадает с ожидаемой ${RAG_EMBEDDING_DIMENSION}`,
        );
      }
    });

    return rows;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embedMany([text]);
    if (!vector) {
      throw new Error('Не удалось получить embedding для поискового запроса');
    }
    return vector;
  }
}

function normalizeTensorRows(value: unknown): number[][] {
  if (!Array.isArray(value)) {
    throw new Error('Неожиданная форма тензора embeddings');
  }

  if (value.length === 0) {
    return [];
  }

  if (typeof value[0] === 'number') {
    return [value as number[]];
  }

  if (Array.isArray(value[0]) && typeof value[0][0] === 'number') {
    return value as number[][];
  }

  if (Array.isArray(value[0]) && Array.isArray(value[0][0])) {
    return (value as unknown[][][]).map((row) => row[0] as number[]);
  }

  throw new Error('Неожиданная форма тензора embeddings');
}
