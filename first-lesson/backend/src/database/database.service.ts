import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Pool, PoolClient, QueryResult } from 'pg';
import { MigrationsService } from './migrations.service';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  private readonly asyncLocalStorage = new AsyncLocalStorage<PoolClient>();
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @Inject(forwardRef(() => MigrationsService))
    private readonly migrationsService: MigrationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const client = await this.pool.connect();
    this.logger.log('Connected to PostgreSQL');
    client.release();

    await this.migrationsService.runMigrations();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.logger.log('PostgreSQL pool closed');
  }

  async query<T = any>(
    sql: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    const client = this.asyncLocalStorage.getStore();
    if (client) {
      return client.query<T>(sql, params);
    }
    return this.pool.query<T>(sql, params);
  }

  getPool(): Pool {
    return this.pool;
  }

  getAsyncLocalStorage(): AsyncLocalStorage<PoolClient> {
    return this.asyncLocalStorage;
  }
}
