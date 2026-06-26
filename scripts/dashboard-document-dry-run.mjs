/**
 * Foundation D dry-run (READ-ONLY): report how many existing dashboard rows would
 * fail v1 validation — i.e. would block the D1 backfill. Run against the
 * production database before committing to the storage split.
 *
 *   npm run build:core
 *   DATABASE_URL=postgres://… npm run db:dashboard:dry-run
 *
 * Makes no writes. Mirrors exactly what the D1 backfill will assemble: the flat
 * content columns -> @freeboard/core migrate + validate.
 */

import { validateDashboardDocument } from "@freeboard/core/validate.js";
import { createMigrationPool } from "./lib/postgres-migration-utils.mjs";

const main = async () => {
  const pool = await createMigrationPool();
  try {
    const { rows } = await pool.query(
      "SELECT id, version, title, image, datasources, columns, width, panes, settings FROM dashboards",
    );

    let valid = 0;
    const invalid = [];
    const byCode = new Map();

    for (const row of rows) {
      const content = {
        title: row.title,
        version: row.version,
        image: row.image,
        datasources: row.datasources,
        columns: row.columns,
        width: row.width,
        panes: row.panes,
        settings: row.settings,
      };
      const result = validateDashboardDocument(content);
      if (result.valid) {
        valid += 1;
        continue;
      }
      invalid.push({
        id: row.id,
        codes: result.errors.map((issue) => `${issue.code}@${issue.path || "/"}`),
      });
      for (const issue of result.errors) {
        byCode.set(issue.code, (byCode.get(issue.code) || 0) + 1);
      }
    }

    console.log(
      `[dashboard-dry-run] ${rows.length} dashboards: ${valid} valid, ${invalid.length} invalid.`,
    );
    if (invalid.length > 0) {
      console.log("\nInvalid rows (would block the D1 backfill):");
      for (const row of invalid) {
        console.log(`  ${row.id}  ${row.codes.join(", ")}`);
      }
      console.log("\nBy error code:");
      for (const [code, count] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${code}: ${count}`);
      }
      console.log(
        `\nD1 should not proceed until these ${invalid.length} row(s) are repaired ` +
          "(re-save from the UI, or a manual fix) or confirmed acceptable.",
      );
    } else {
      console.log(
        "All dashboards already produce a valid v1 document — the D1 backfill would not block.",
      );
    }
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error("[dashboard-dry-run] failed:", error);
  process.exitCode = 1;
});
