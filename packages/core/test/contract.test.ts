// Loads the fixture catalogue the way the app will (manifest → tiles → scoring) and checks
// it against the pipeline's JSON Schema, so the Python and TypeScript sides cannot drift.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type Manifest, type ScoringConfig, type Tile } from "../src/index.ts";

const repoFile = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const readBytes = (path: string) => readFileSync(repoFile(path));
const readJson = (path: string): unknown => JSON.parse(readBytes(path).toString("utf8"));

const schema = readJson("schema/v1/threex.schema.json") as { $id: string };
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats.default(ajv);
ajv.addSchema(schema);

function validate<T>(definition: "Manifest" | "Tile" | "ScoringConfig", data: unknown): T {
  const check = ajv.getSchema(`${schema.$id}#/$defs/${definition}`);
  if (!check) throw new Error(`schema has no ${definition}`);
  if (!check(data)) throw new Error(ajv.errorsText(check.errors, { dataVar: definition }));
  return data as T;
}

const manifest = validate<Manifest>("Manifest", readJson("fixtures/v1/manifest.json"));
const tiles = manifest.tiles.map((ref) => ({ ref, bytes: readBytes(`fixtures/v1/${ref.path}`) }));

describe("fixture catalogue", () => {
  it("speaks the schema version this package understands", () => {
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("has tiles whose hashes, geohashes and spot counts match the manifest", () => {
    for (const { ref, bytes } of tiles) {
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(ref.sha256);
      const tile = validate<Tile>("Tile", JSON.parse(bytes.toString("utf8")));
      expect(tile.geohash).toBe(ref.geohash);
      expect(tile.spots).toHaveLength(ref.spotCount);
      expect(tile.dataVersion).toBe(manifest.dataVersion);
    }
  });

  it("only references tide series and attributions that exist", () => {
    const attributionIds = new Set(manifest.attributions.map((a) => a.id));
    for (const { bytes } of tiles) {
      const tile = JSON.parse(bytes.toString("utf8")) as Tile;
      const tideIds = new Set(tile.tides.map((t) => t.id));
      for (const spot of tile.spots) {
        if (spot.tideClusterId != null) expect(tideIds).toContain(spot.tideClusterId);
        for (const id of [...spot.sources, ...spot.features.map((f) => f.source)]) {
          expect(attributionIds).toContain(id);
        }
      }
    }
  });

  it("covers every water type", () => {
    const waterTypes = new Set(
      tiles.flatMap(({ bytes }) =>
        (JSON.parse(bytes.toString("utf8")) as Tile).spots.map((s) => s.waterType),
      ),
    );
    expect([...waterTypes].sort()).toEqual(["coastal", "estuary", "freshwater"]);
  });

  it("ships the same scoring config the app will bundle", () => {
    const bytes = readBytes(`fixtures/v1/${manifest.scoring.path}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.scoring.sha256);
    const published = validate<ScoringConfig>("ScoringConfig", JSON.parse(bytes.toString("utf8")));
    const authored = validate<ScoringConfig>(
      "ScoringConfig",
      readJson("config/scoring-config.json"),
    );
    expect(published).toEqual(authored);
    expect(published.version).toBe(manifest.scoring.version);
  });
});

describe("schema", () => {
  it("rejects documents that break the contract", () => {
    const tile = JSON.parse(tiles[0]!.bytes.toString("utf8")) as Tile;
    const broken = { ...tile, spots: [{ ...tile.spots[0], waterType: "ocean" }] };
    expect(() => validate("Tile", broken)).toThrow(/waterType/);
    expect(() => validate("Tile", { ...tile, surprise: true })).toThrow(/additional properties/);
  });
});
