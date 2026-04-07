import { Module } from '@nestjs/common';
import { MemoryAssemblerService } from './memory-assembler.service';
import { UserProfileModule } from '../user-profile/user-profile.module';
import { ProjectModule } from '../project/project.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [UserProfileModule, ProjectModule, AIModule],
  providers: [MemoryAssemblerService],
  exports: [MemoryAssemblerService],
})
export class MemoryModule {}
