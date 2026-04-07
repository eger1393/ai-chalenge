import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Injectable()
export class TransactionService {
  constructor(private readonly databaseService: DatabaseService) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.databaseService.getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await this.databaseService
        .getAsyncLocalStorage()
        .run(client, fn);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
