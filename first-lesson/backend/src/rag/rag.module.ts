import { Module } from '@nestjs/common';
import { RagEmbeddingService } from './rag-embedding.service';
import { RagRepository } from './rag.repository';
import { RagRerankerService } from './rag-reranker.service';
import { RagService } from './rag.service';

@Module({
  providers: [RagEmbeddingService, RagRepository, RagRerankerService, RagService],
  exports: [RagEmbeddingService, RagRepository, RagRerankerService, RagService],
})
export class RagModule {}
