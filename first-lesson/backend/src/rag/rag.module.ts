import { Module } from '@nestjs/common';
import { RagEmbeddingService } from './rag-embedding.service';
import { RagRepository } from './rag.repository';
import { RagService } from './rag.service';

@Module({
  providers: [RagEmbeddingService, RagRepository, RagService],
  exports: [RagEmbeddingService, RagRepository, RagService],
})
export class RagModule {}
