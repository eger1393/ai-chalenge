import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { TransactionService } from './transaction.service';
import { MigrationsService } from './migrations.service';

@Global()
@Module({
  providers: [DatabaseService, TransactionService, MigrationsService],
  exports: [DatabaseService, TransactionService, MigrationsService],
})
export class DatabaseModule {}
