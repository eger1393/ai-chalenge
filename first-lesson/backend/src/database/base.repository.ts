import { DatabaseService } from './database.service';

export abstract class BaseRepository<T> {
  constructor(
    protected readonly db: DatabaseService,
    protected readonly tableName: string,
  ) {}

  async findById(id: string): Promise<T | null> {
    const result = await this.db.query<T>(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
