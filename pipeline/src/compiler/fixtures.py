"""A small, synthetic Kochi catalogue used as the golden contract fixture.

Every value here is made up to look plausible: place names are real so the app's UI reads
naturally in tests, but the facts, tides and validation numbers are not real data. The
fixture spans all three water types and two tiles so client code exercises multi-tile loading.
"""

import math
from datetime import UTC, datetime, timedelta

from compiler import geo
from compiler.attributions import ATTRIBUTIONS
from compiler.models import (
    SCHEMA_VERSION,
    Coordinate,
    Feature,
    FeatureKind,
    Habitat,
    Region,
    River,
    ScoringConfig,
    Spot,
    TideSeries,
    TideValidation,
    Tile,
    WaterType,
)
from compiler.paths import SCORING_CONFIG_FILE
from compiler.publish.layout import Catalogue
from compiler.tides.events import find_events, mean_range_cm

DATA_VERSION = "fixture"
GENERATED_AT = datetime(2026, 10, 31, 18, 0, tzinfo=UTC)
TIDE_START = datetime(2026, 11, 1, 0, 0, tzinfo=UTC)
TIDE_HOURS = 72

# (amplitude cm, period h, phase rad): a mixed semidiurnal tide like Kochi's.
_CONSTITUENTS = [(30, 12.4206, 1.2), (12, 12.0, 2.0), (18, 23.9345, 0.4), (9, 25.8193, 5.5)]

# Arabian Sea off Kerala: warm most of the year, cooled by the June-September monsoon.
_SST_NORMALS_C = [28.2, 28.6, 29.5, 30.3, 30.0, 28.4, 27.2, 26.9, 27.3, 28.1, 28.6, 28.4]


def _spot_id(lat: float, lon: float) -> str:
    return f"sp-{geo.encode(lat, lon, 8)}"


def _synthetic_heights(hours: int) -> list[int]:
    return [
        round(
            sum(
                a * math.cos(2 * math.pi * t / period - phase) for a, period, phase in _CONSTITUENTS
            )
        )
        for t in range(hours + 1)
    ]


def _kochi_mouth_tides() -> TideSeries:
    heights = _synthetic_heights(TIDE_HOURS)
    events = find_events(TIDE_START, 60, heights)
    return TideSeries(
        id="tc-kochi-mouth",
        model="synthetic",
        datum="MSL",
        start=TIDE_START,
        step_minutes=60,
        heights_cm=heights,
        events=events,
        mean_range_cm=round(mean_range_cm(events), 1),
        confidence=0.8,
        validation=TideValidation(
            station_id="uhslc-174",
            station_name="Cochin (Willingdon Island)",
            rmse_cm=9.5,
            timing_error_minutes=14,
        ),
    )


def _coastal_tile(tides: TideSeries) -> Tile:
    breakwater = (9.9667, 76.2386)
    mangroves = (9.9890, 76.2290)
    spots = [
        Spot(
            id=_spot_id(*breakwater),
            name="Fort Kochi Breakwater",
            locality="Fort Kochi, Ernakulam",
            coordinate=Coordinate(lat=breakwater[0], lon=breakwater[1]),
            water_type=WaterType.COASTAL,
            access_distance_m=50,
            depth_m=4.5,
            depth_slope=3.0,
            features=[
                Feature(kind=FeatureKind.BREAKWATER, distance_m=15, source="osm"),
                Feature(kind=FeatureKind.ROCKS, distance_m=40, source="osm"),
                Feature(kind=FeatureKind.CHANNEL_EDGE, distance_m=120, source="gebco"),
            ],
            habitat=Habitat(
                mangrove_m=2500,
                river_mouth_m=600,
                chlorophyll_mg_m3=3.2,
                sst_normal_c=_SST_NORMALS_C,
            ),
            tide_cluster_id=tides.id,
            confidence=0.8,
            sources=["osm", "fes2022", "gebco", "gmw", "coastwatch"],
        ),
        Spot(
            id=_spot_id(*mangroves),
            name="Vypin Mangrove Edge",
            locality="Vypin, Ernakulam",
            coordinate=Coordinate(lat=mangroves[0], lon=mangroves[1]),
            water_type=WaterType.ESTUARY,
            access_distance_m=120,
            depth_m=1.8,
            depth_slope=0.8,
            features=[
                Feature(
                    kind=FeatureKind.MANGROVE_EDGE, distance_m=10, min_tide_cm=20, source="gmw"
                ),
                Feature(kind=FeatureKind.CHANNEL_EDGE, distance_m=90, source="gebco"),
                Feature(kind=FeatureKind.JETTY, distance_m=180, source="osm"),
            ],
            habitat=Habitat(
                mangrove_m=10,
                river_mouth_m=2400,
                chlorophyll_mg_m3=6.5,
                sst_normal_c=[round(t + 0.3, 1) for t in _SST_NORMALS_C],
            ),
            tide_cluster_id=tides.id,
            confidence=0.6,
            sources=["osm", "fes2022", "gebco", "gmw", "coastwatch"],
        ),
    ]
    return Tile(
        schema_version=SCHEMA_VERSION,
        data_version=DATA_VERSION,
        geohash=geo.encode(*breakwater, 4),
        generated_at=GENERATED_AT,
        spots=spots,
        tides=[tides],
    )


def _freshwater_tile() -> Tile:
    river = (10.1076, 76.3516)
    spot = Spot(
        id=_spot_id(*river),
        name="Periyar at Aluva Manalpuram",
        locality="Aluva, Ernakulam",
        coordinate=Coordinate(lat=river[0], lon=river[1]),
        water_type=WaterType.FRESHWATER,
        access_distance_m=80,
        features=[
            Feature(kind=FeatureKind.WEED_BED, distance_m=40, source="osm"),
            Feature(kind=FeatureKind.BRIDGE_PILINGS, distance_m=60, source="osm"),
        ],
        habitat=Habitat(weed_bed_m=40),
        river=River(discharge_median_m3s=220),
        confidence=0.5,
        sources=["osm"],
    )
    return Tile(
        schema_version=SCHEMA_VERSION,
        data_version=DATA_VERSION,
        geohash=geo.encode(*river, 4),
        generated_at=GENERATED_AT,
        spots=[spot],
        tides=[],
    )


def build_fixture_catalogue() -> Catalogue:
    tides = _kochi_mouth_tides()
    used = ["osm", "fes2022", "uhslc", "gebco", "gmw", "coastwatch"]
    return Catalogue(
        data_version=DATA_VERSION,
        region=Region(id="in-kochi-fixture", name="Kochi pilot (synthetic fixture)"),
        generated_at=GENERATED_AT,
        valid_until=TIDE_START + timedelta(hours=TIDE_HOURS),
        tiles=[_coastal_tile(tides), _freshwater_tile()],
        scoring=ScoringConfig.model_validate_json(SCORING_CONFIG_FILE.read_bytes()),
        attributions=[ATTRIBUTIONS[i] for i in used],
    )
