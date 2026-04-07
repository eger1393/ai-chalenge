import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ProjectRepository extends BaseRepository<Project> {
  constructor(db: DatabaseService) {
    super(db, 'projects');
  }

  async findByUserId(userId: string, status?: string): Promise<Project[]> {
    const statusFilter = status || 'active';
    const result = await this.db.query<Project>(
      `SELECT * FROM projects WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC`,
      [userId, statusFilter],
    );
    return result.rows;
  }

  async create(userId: string, title: string, description?: string): Promise<Project> {
    const result = await this.db.query<Project>(
      `INSERT INTO projects (user_id, title, description) VALUES ($1, $2, $3) RETURNING *`,
      [userId, title, description ?? null],
    );
    return result.rows[0];
  }

  async update(
    id: string,
    data: { title?: string; description?: string; status?: string },
  ): Promise<Project> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.title !== undefined) {
      sets.push(`title = $${idx++}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(data.description);
    }
    if (data.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(data.status);
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.db.query<Project>(
      `UPDATE projects SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return result.rows[0];
  }

  async findByIdAndUserId(id: string, userId: string): Promise<Project | null> {
    const result = await this.db.query<Project>(
      `SELECT * FROM projects WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return result.rows[0] || null;
  }
}
