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
 * Repair runs before validation so a missing order key or an unknown type id can be
 * fixed instead of rejecting the file. The plan lists validate before load; the
 * repairs in section 7.4 have to happen or those files would never validate.
 */
export function loadMap(input: unknown): LoadedMap {
  const migrated = migrateToCurrent(input);
  if (migrated.newer) {
    try {
      assertMapSchema(migrated.value);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new MapLoadError(
        `This map was made with a newer version (v${migrated.from}). It was not modified. ${reason}`,
      );
    }
    return {
      doc: migrated.value as MapDocument,
      warnings: [
        {
          level: "warning",
          code: "newer-version",
          message: `This map was made with a newer version (v${migrated.from}). Opened read-only.`,
        },
      ],
      readOnly: true,
      migratedFrom: null,
      migrations: [],
    };
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
