import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';

export interface ProjectInvariant {
  id: string;
  project_id: string;
  content: string;
  created_at: string;
}

@Injectable()
export class InvariantRepository extends BaseRepository<ProjectInvariant> {
  constructor(db: DatabaseService) {
    super(db, 'project_invariants');
  }

  async findByProjectId(projectId: string): Promise<ProjectInvariant[]> {
    const result = await this.db.query<ProjectInvariant>(
      `SELECT * FROM project_invariants WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId],
    );
    return result.rows;
  }

  async getContentByProjectId(projectId: string): Promise<string[]> {
    const result = await this.db.query<{ content: string }>(
      `SELECT content FROM project_invariants WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId],
    );
    return result.rows.map((r) => r.content);
  }

  async create(projectId: string, content: string): Promise<ProjectInvariant> {
    const result = await this.db.query<ProjectInvariant>(
      `INSERT INTO project_invariants (project_id, content) VALUES ($1, $2) RETURNING *`,
      [projectId, content],
    );
    return result.rows[0];
  }

  async deleteByIdAndProjectId(id: string, projectId: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM project_invariants WHERE id = $1 AND project_id = $2`,
      [id, projectId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
