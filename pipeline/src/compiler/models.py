"""Published data contract, schema v1.

These models are the single source of truth for everything the pipeline publishes.
`threex-compile schema` exports them to `schema/v1/threex.schema.json`, and `@threex/core`
generates its TypeScript types from that file. JSON uses camelCase; Python uses snake_case.

The pipeline publishes *facts* about spots (structure, habitat, depth, predicted tides).
It never scores them: all 3X scoring happens in `@threex/core`, driven by `ScoringConfig`.
"""

from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from compiler import geo

SCHEMA_VERSION = 1


class Contract(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        frozen=True,
    )


UnitInterval = Annotated[float, Field(ge=0, le=1)]
Metres = Annotated[float, Field(ge=0)]
Id = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9_-]{2,63}$")]
Geohash4 = Annotated[str, Field(pattern=r"^[0-9b-hjkmnp-z]{4}$")]
Sha256 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
DataVersion = Annotated[str, Field(pattern=r"^[0-9a-z][0-9a-z.-]{0,39}$")]
HttpsUrl = Annotated[str, Field(pattern=r"^https://\S+$")]


class WaterType(StrEnum):
    COASTAL = "coastal"
    ESTUARY = "estuary"
    FRESHWATER = "freshwater"


class Pillar(StrEnum):
    COMFORT = "comfort"
    SAFETY = "safety"
    FOOD = "food"


class FeatureKind(StrEnum):
    PIER = "pier"
    BREAKWATER = "breakwater"
    GROYNE = "groyne"
    JETTY = "jetty"
    ROCKS = "rocks"
    REEF = "reef"
    WRECK = "wreck"
    BRIDGE_PILINGS = "bridgePilings"
    WEIR = "weir"
    DAM = "dam"
    DROP_OFF = "dropOff"
    CHANNEL_EDGE = "channelEdge"
    RIVER_MOUTH = "riverMouth"
    CONFLUENCE = "confluence"
    MANGROVE_EDGE = "mangroveEdge"
    WEED_BED = "weedBed"


VEGETATION_KINDS = frozenset({FeatureKind.MANGROVE_EDGE, FeatureKind.WEED_BED})


# ---------------------------------------------------------------------------
# Tiles: spots and tide predictions
# ---------------------------------------------------------------------------


class Coordinate(Contract):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class Feature(Contract):
    """A physical feature near a spot that can shelter fish."""

    kind: FeatureKind
    distance_m: Metres
    min_tide_cm: int | None = Field(
        default=None,
        description=(
            "Tide height (cm, in the spot's tide-series datum) at or above which the feature "
            "holds fish, e.g. a mangrove edge that floods only near high tide. "
            "Omitted when the feature works at any tide."
        ),
    )
    source: Id = Field(description="Attribution id of the dataset the feature came from.")


class Habitat(Contract):
    """Distances to food-producing habitat, plus productivity normals."""

    mangrove_m: Metres | None = None
    reef_m: Metres | None = None
    weed_bed_m: Metres | None = None
    river_mouth_m: Metres | None = None
    chlorophyll_mg_m3: float | None = Field(
        default=None, ge=0, description="Recent chlorophyll-a composite (mg/m³)."
    )
    sst_normal_c: list[float] | None = Field(
        default=None,
        min_length=12,
        max_length=12,
        description="Monthly sea-surface temperature normals in °C, January to December.",
    )


class River(Contract):
    discharge_median_m3s: float = Field(
        gt=0, description="Median river discharge (m³/s), the baseline for flow comfort."
    )


class Spot(Contract):
    id: Id
    name: str = Field(min_length=1, max_length=80)
    locality: str | None = Field(default=None, max_length=80)
    coordinate: Coordinate
    water_type: WaterType
    access_distance_m: Metres | None = Field(
        default=None, description="Walking distance from the nearest public road or path."
    )
    depth_m: Metres | None = Field(default=None, description="Depth below the tide datum.")
    depth_slope: float | None = Field(
        default=None, ge=0, description="Bottom slope near the spot, metres of depth per 100 m."
    )
    features: list[Feature]
    habitat: Habitat
    tide_cluster_id: Id | None = Field(
        default=None, description="Id of the tide series in the same tile; tidal spots only."
    )
    river: River | None = None
    confidence: UnitInterval = Field(description="How much the underlying data can be trusted.")
    sources: list[Id] = Field(min_length=1, description="Attribution ids used for this spot.")

    @model_validator(mode="after")
    def _tide_matches_water_type(self) -> Self:
        tidal = self.water_type is not WaterType.FRESHWATER
        if tidal and self.tide_cluster_id is None:
            raise ValueError(f"{self.water_type} spot {self.id} needs a tide_cluster_id")
        if not tidal and self.tide_cluster_id is not None:
            raise ValueError(f"freshwater spot {self.id} must not have a tide_cluster_id")
        return self


class TideEventKind(StrEnum):
    HIGH = "high"
    LOW = "low"


class TideEvent(Contract):
    time: AwareDatetime
    kind: TideEventKind
    height_cm: int


class TideValidation(Contract):
    """How well the predicted series matched a real tide gauge."""

    station_id: str
    station_name: str
    rmse_cm: float = Field(ge=0)
    timing_error_minutes: float = Field(ge=0)


class TideSeries(Contract):
    """Predicted tide heights shared by every spot in a tide cluster."""

    id: Id
    model: str = Field(description="Tide model used for the prediction, e.g. FES2022b.")
    datum: Literal["MSL"]
    start: AwareDatetime
    step_minutes: int = Field(gt=0, le=60)
    heights_cm: list[int] = Field(min_length=2)
    events: list[TideEvent]
    mean_range_cm: float = Field(ge=0, description="Mean high-to-low range over the series.")
    confidence: UnitInterval
    validation: TideValidation | None = None

    @model_validator(mode="after")
    def _events_inside_series(self) -> Self:
        span_s = (len(self.heights_cm) - 1) * self.step_minutes * 60
        times = [event.time for event in self.events]
        if times != sorted(times):
            raise ValueError(f"tide series {self.id}: events must be in time order")
        for event in self.events:
            offset_s = (event.time - self.start).total_seconds()
            if not 0 <= offset_s <= span_s:
                raise ValueError(f"tide series {self.id}: event at {event.time} is outside series")
        return self


class Tile(Contract):
    schema_version: Literal[1]
    data_version: DataVersion
    geohash: Geohash4
    generated_at: AwareDatetime
    spots: list[Spot]
    tides: list[TideSeries]

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        spot_ids = [spot.id for spot in self.spots]
        if len(spot_ids) != len(set(spot_ids)):
            raise ValueError(f"tile {self.geohash}: duplicate spot ids")
        tide_ids = {tide.id for tide in self.tides}
        if len(tide_ids) != len(self.tides):
            raise ValueError(f"tile {self.geohash}: duplicate tide series ids")
        for spot in self.spots:
            if not geo.contains(self.geohash, spot.coordinate.lat, spot.coordinate.lon):
                raise ValueError(f"tile {self.geohash}: spot {spot.id} lies outside the tile")
            if spot.tide_cluster_id is not None and spot.tide_cluster_id not in tide_ids:
                raise ValueError(
                    f"tile {self.geohash}: spot {spot.id} references unknown tide series "
                    f"{spot.tide_cluster_id}"
                )
        return self


# ---------------------------------------------------------------------------
# Manifest: the entry point the app fetches first
# ---------------------------------------------------------------------------


class Attribution(Contract):
    id: Id
    name: str
    license: str
    url: HttpsUrl
    text: str = Field(description="Credit line to show in the app.")
    display_required: bool


class TileRef(Contract):
    geohash: Geohash4
    path: str = Field(pattern=r"^tiles/[0-9b-hjkmnp-z]{4}\.[0-9a-f]{12}\.json$")
    sha256: Sha256
    spot_count: int = Field(ge=0)


class ScoringRef(Contract):
    path: str = Field(pattern=r"^scoring/[0-9a-f]{12}\.json$")
    sha256: Sha256
    version: str


class Region(Contract):
    id: Id
    name: str


class Manifest(Contract):
    schema_version: Literal[1]
    data_version: DataVersion
    region: Region
    generated_at: AwareDatetime
    valid_until: AwareDatetime = Field(
        description="Tide predictions run out after this; the app warns when data is older."
    )
    tiles: list[TileRef]
    scoring: ScoringRef
    attributions: list[Attribution]

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if self.valid_until <= self.generated_at:
            raise ValueError("valid_until must be after generated_at")
        geohashes = [tile.geohash for tile in self.tiles]
        if len(geohashes) != len(set(geohashes)):
            raise ValueError("duplicate tile geohashes")
        attribution_ids = [attribution.id for attribution in self.attributions]
        if len(attribution_ids) != len(set(attribution_ids)):
            raise ValueError("duplicate attribution ids")
        return self


# ---------------------------------------------------------------------------
# Scoring config: thresholds and weights the app's 3X engine uses
# ---------------------------------------------------------------------------


class SignalId(StrEnum):
    """Inputs to the pillar scores. Units are listed in docs/3x-framework.md."""

    # Comfort
    TIDAL_FLOW = "tidalFlow"
    CURRENT_SPEED = "currentSpeed"
    WATER_TEMP_ANOMALY = "waterTempAnomaly"
    LIGHT_LEVEL = "lightLevel"
    WIND_SPEED = "windSpeed"
    WAVE_HEIGHT = "waveHeight"
    DISCHARGE_RATIO = "dischargeRatio"
    # Safety
    STRUCTURE_COVER = "structureCover"
    VEGETATION_COVER = "vegetationCover"
    WATER_DEPTH = "waterDepth"
    # Food
    NURSERY_HABITAT = "nurseryHabitat"
    CHLOROPHYLL = "chlorophyll"
    TIDE_MOVEMENT = "tideMovement"
    LOW_LIGHT_FEEDING = "lowLightFeeding"
    PRESSURE_TREND = "pressureTrend"
    SOLUNAR = "solunar"


PILLAR_SIGNALS: dict[Pillar, frozenset[SignalId]] = {
    Pillar.COMFORT: frozenset(
        {
            SignalId.TIDAL_FLOW,
            SignalId.CURRENT_SPEED,
            SignalId.WATER_TEMP_ANOMALY,
            SignalId.LIGHT_LEVEL,
            SignalId.WIND_SPEED,
            SignalId.WAVE_HEIGHT,
            SignalId.DISCHARGE_RATIO,
        }
    ),
    Pillar.SAFETY: frozenset(
        {SignalId.STRUCTURE_COVER, SignalId.VEGETATION_COVER, SignalId.WATER_DEPTH}
    ),
    Pillar.FOOD: frozenset(
        {
            SignalId.NURSERY_HABITAT,
            SignalId.CHLOROPHYLL,
            SignalId.TIDE_MOVEMENT,
            SignalId.LOW_LIGHT_FEEDING,
            SignalId.PRESSURE_TREND,
            SignalId.SOLUNAR,
        }
    ),
}


class Band(Contract):
    """Trapezoid membership: 1 inside [idealMin, idealMax], falling linearly to 0 over
    `falloff` on either side. A falloff of 0 makes the band a hard yes/no."""

    weight: float = Field(gt=0)
    ideal_min: float
    ideal_max: float
    falloff: float = Field(ge=0)

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.ideal_min > self.ideal_max:
            raise ValueError("ideal_min must not exceed ideal_max")
        return self


class PillarScoring(Contract):
    threshold: UnitInterval = Field(description="Score at or above which the pillar earns its X.")
    min_coverage: UnitInterval = Field(
        description="Share of total signal weight that must have data, else the pillar is unknown."
    )
    signals: dict[SignalId, Band] = Field(min_length=1)


class WaterTypeScoring(Contract):
    comfort: PillarScoring
    safety: PillarScoring
    food: PillarScoring

    @model_validator(mode="after")
    def _signals_belong_to_pillar(self) -> Self:
        for pillar in Pillar:
            stray = set(getattr(self, pillar.value).signals) - PILLAR_SIGNALS[pillar]
            if stray:
                names = ", ".join(sorted(stray))
                raise ValueError(f"{pillar.value} cannot use signals: {names}")
        return self


class WaterTypes(Contract):
    coastal: WaterTypeScoring
    estuary: WaterTypeScoring
    freshwater: WaterTypeScoring


class StructureScoring(Contract):
    radius_m: float = Field(gt=0, description="Features farther than this give no cover.")
    kind_weights: dict[FeatureKind, UnitInterval]

    @model_validator(mode="after")
    def _all_kinds_weighted(self) -> Self:
        missing = set(FeatureKind) - set(self.kind_weights)
        if missing:
            raise ValueError(f"kind_weights is missing: {', '.join(sorted(missing))}")
        return self


class RatingScoring(Contract):
    recommended_min_x: int = Field(ge=1, le=3)
    worth_a_look_min_x: int = Field(ge=1, le=3)

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.worth_a_look_min_x > self.recommended_min_x:
            raise ValueError("worth_a_look_min_x must not exceed recommended_min_x")
        return self


class PlannerScoring(Contract):
    horizon_hours: int = Field(ge=1, le=240)
    min_window_minutes: int = Field(ge=0)


class ScoringConfig(Contract):
    schema_version: Literal[1]
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    water_types: WaterTypes
    structure: StructureScoring
    rating: RatingScoring
    planner: PlannerScoring
