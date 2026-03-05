import { initialSchemaMigration } from './001_initial_schema';

export type DatabaseMigration = {
  filename: string;
  renderSql: (embeddingDim: number) => string;
};

export const databaseMigrations: DatabaseMigration[] = [initialSchemaMigration];
