#!/usr/bin/env node

import {
  createMigrationPool,
  ensureMigrationsTable,
  formatMigrationLabel,
  listAppliedMigrations,
  loadMigrations,
} from "./lib/postgres-migration-utils.mjs";

const LOG_PREFIX = "[db:schema:status]";

const main = async () => {
  const pool = await createMigrationPool();

  try {
    await ensureMigrationsTable(pool);

    const migrations = loadMigrations();
    const applied = await listAppliedMigrations(pool);

    const appliedByVersion = new Map(applied.map((row) => [row.version, row]));

    console.log(`${LOG_PREFIX} total=${migrations.length} applied=${applied.length}`);
    for (const migration of migrations) {
      const appliedRow = appliedByVersion.get(migration.version);
      const checksumStatus = appliedRow
        ? appliedRow.checksum === migration.checksum
          ? "checksum=ok"
          : "checksum=changed"
        : "checksum=pending";
      const status = appliedRow ? "applied" : "pending";
      const appliedAt = appliedRow?.appliedAt ? new Date(appliedRow.appliedAt).toISOString() : "-";
      console.log(
        `${LOG_PREFIX} ${migration.version} ${status.padEnd(7)} ${checksumStatus.padEnd(16)} ${formatMigrationLabel(migration)} appliedAt=${appliedAt}`,
      );
    }

    const migrationVersions = new Set(migrations.map((migration) => migration.version));
    const unknownApplied = applied.filter((row) => !migrationVersions.has(row.version));
    if (unknownApplied.length > 0) {
      console.warn(`${LOG_PREFIX} applied schema migrations missing from files:`);
      for (const row of unknownApplied) {
        console.warn(`${LOG_PREFIX} - ${row.version} ${row.name}`);
      }
      process.exitCode = 1;
    }

    const checksumMismatch = migrations.some((migration) => {
      const appliedRow = appliedByVersion.get(migration.version);
      if (!appliedRow) {
        return false;
      }
      return appliedRow.checksum !== migration.checksum;
    });
    if (checksumMismatch) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(`${LOG_PREFIX} failed.`);
  console.error(error);
  process.exit(1);
});
