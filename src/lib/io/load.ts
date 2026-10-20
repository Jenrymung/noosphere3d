import { CURRENT_VERSION, type Issue, type MapDocument } from "../core/types";
import { repairDocument } from "./integrity";
import { migrateToCurrent } from "./migrate";
import { MapLoadError, assertMapSchema } from "./schema";

export interface LoadedMap {
  doc: MapDocument;
  warnings: Issue[];
  readOnly: boolean;
  migratedFrom: number | null;
  migrations: string[];
}

/**
 * parse result → detect version → migrate step by step → repair integrity → validate.
 * A newer major version is refused before repair, so the file is never opened or written.
 * A newer minor version is opened normally. Repair runs before validation so a missing
 * order key or an unknown type id can be fixed instead of rejecting the file.
 */
export function loadMap(input: unknown): LoadedMap {
  const migrated = migrateToCurrent(input);
  if (migrated.newerMajor) {
    throw new MapLoadError(
      `This map was made with a newer version (v${migrated.from}). It was not modified.`,
    );
  }
  const draft = structuredClone(migrated.value) as MapDocument;
  const warnings = repairDocument(draft);
  assertMapSchema(draft);
  return {
    doc: draft,
    warnings,
    readOnly: false,
    migratedFrom: migrated.from < CURRENT_VERSION ? migrated.from : null,
    migrations: migrated.applied,
  };
}
