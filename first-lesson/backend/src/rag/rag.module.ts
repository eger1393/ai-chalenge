import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { RagEmbeddingService } from './rag-embedding.service';
import { RagQueryRewriteService } from './rag-query-rewrite.service';
import { RagRepository } from './rag.repository';
import { RagRerankerService } from './rag-reranker.service';
import { RagService } from './rag.service';

@Module({
  imports: [AIModule],
  providers: [RagEmbeddingService, RagQueryRewriteService, RagRepository, RagRerankerService, RagService],
  exports: [RagEmbeddingService, RagQueryRewriteService, RagRepository, RagRerankerService, RagService],
})
export class RagModule {}
