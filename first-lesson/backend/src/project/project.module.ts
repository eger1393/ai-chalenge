import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ProjectRepository } from './repositories/project.repository';
import { InvariantRepository } from './repositories/invariant.repository';

@Module({
  controllers: [ProjectController],
  providers: [ProjectService, ProjectRepository, InvariantRepository],
  exports: [ProjectService],
})
export class ProjectModule {}
