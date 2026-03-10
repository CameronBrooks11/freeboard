#!/usr/bin/env node

import {
  applyMigrationDown,
  applyMigrationUp,
  createMigrationPool,
  ensureMigrationsTable,
  formatMigrationLabel,
  listAppliedMigrations,
  loadMigrations,
} from "./lib/postgres-migration-utils.mjs";

const LOG_PREFIX = "[db:migrate]";

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
};

const parseArguments = (argv) => {
  const isDown = argv.includes("--down");
  const stepsArg = argv.find((arg) => arg.startsWith("--steps="));
  const steps = stepsArg ? parsePositiveInteger(stepsArg.split("=", 2)[1], 1) : 1;
  return {
    isDown,
    steps,
  };
};

const main = async () => {
  const { isDown, steps } = parseArguments(process.argv.slice(2));
  const pool = await createMigrationPool();

  try {
    await ensureMigrationsTable(pool);

    const migrations = loadMigrations();
    const applied = await listAppliedMigrations(pool);

    const migrationByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
    const appliedByVersion = new Map(applied.map((row) => [row.version, row]));

    for (const appliedRow of applied) {
      const migration = migrationByVersion.get(appliedRow.version);
      if (!migration) {
        throw new Error(
          `Applied migration version '${appliedRow.version}' is missing from migration files. Refusing to continue.`,
        );
      }
      if (migration.checksum !== appliedRow.checksum) {
        throw new Error(
          `Checksum mismatch for migration '${formatMigrationLabel(migration)}'. Applied=${appliedRow.checksum} Current=${migration.checksum}`,
        );
      }
    }

    if (!isDown) {
      const pending = migrations.filter((migration) => !appliedByVersion.has(migration.version));
      if (pending.length === 0) {
        console.log(`${LOG_PREFIX} No pending migrations.`);
        return;
      }

      console.log(`${LOG_PREFIX} Applying ${pending.length} migration(s)...`);
      for (const migration of pending) {
        console.log(`${LOG_PREFIX} up ${formatMigrationLabel(migration)}`);
        await applyMigrationUp(pool, migration);
      }
      console.log(`${LOG_PREFIX} Applied ${pending.length} migration(s).`);
      return;
    }

    if (applied.length === 0) {
      console.log(`${LOG_PREFIX} No applied migrations to roll back.`);
      return;
    }

    const appliedDescending = [...applied].sort((left, right) =>
      right.version.localeCompare(left.version),
    );
    const rollbackSelection = appliedDescending.slice(0, steps);

    console.log(`${LOG_PREFIX} Rolling back ${rollbackSelection.length} migration(s)...`);
    for (const appliedRow of rollbackSelection) {
      const migration = migrationByVersion.get(appliedRow.version);
      if (!migration) {
        throw new Error(
          `Cannot roll back version '${appliedRow.version}' because migration file is missing.`,
        );
      }
      console.log(`${LOG_PREFIX} down ${formatMigrationLabel(migration)}`);
      await applyMigrationDown(pool, migration);
    }
    console.log(`${LOG_PREFIX} Rolled back ${rollbackSelection.length} migration(s).`);
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(`${LOG_PREFIX} failed.`);
  console.error(error);
  process.exit(1);
});
