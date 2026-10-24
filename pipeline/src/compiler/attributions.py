"""Credit lines for every dataset the pipeline may publish. See docs/data-sources.md."""

from compiler.models import Attribution

ATTRIBUTIONS: dict[str, Attribution] = {
    a.id: a
    for a in [
        Attribution(
            id="osm",
            name="OpenStreetMap",
            license="ODbL-1.0",
            url="https://www.openstreetmap.org/copyright",
            text="© OpenStreetMap contributors",
            display_required=True,
        ),
        Attribution(
            id="eot20",
            name="EOT20 global ocean tide model",
            license="CC-BY-4.0",
            url="https://doi.org/10.17882/79489",
            text="Tides: EOT20, Hart-Davis et al. (2021), DGFI-TUM (CC BY 4.0)",
            display_required=True,
        ),
        Attribution(
            id="uhslc",
            name="University of Hawaii Sea Level Center",
            license="UHSLC data policy (citation requested)",
            url="https://uhslc.soest.hawaii.edu/",
            text="Tide validation: University of Hawaii Sea Level Center",
            display_required=False,
        ),
        Attribution(
            id="etopo2022",
            name="ETOPO 2022 global relief model (NOAA NCEI)",
            license="Public domain (U.S. Government work)",
            url="https://www.ncei.noaa.gov/products/etopo-global-relief-model",
            text="Depth: NOAA NCEI ETOPO 2022",
            display_required=False,
        ),
        Attribution(
            id="gmw",
            name="Global Mangrove Watch",
            license="CC-BY-4.0",
            url="https://www.globalmangrovewatch.org/",
            text="Mangrove extent: Global Mangrove Watch (CC BY 4.0)",
            display_required=True,
        ),
        Attribution(
            id="allen-coral-atlas",
            name="Allen Coral Atlas",
            license="CC-BY-4.0 (to confirm before first use)",
            url="https://allencoralatlas.org/",
            text="Reef habitat: Allen Coral Atlas",
            display_required=True,
        ),
        Attribution(
            id="coastwatch",
            name="NOAA CoastWatch ERDDAP",
            license="Public domain (U.S. Government work)",
            url="https://coastwatch.pfeg.noaa.gov/erddap/",
            text=(
                "Sea temperature (MUR, NASA JPL) and chlorophyll (MODIS Aqua, NASA) "
                "via NOAA CoastWatch"
            ),
            display_required=False,
        ),
        Attribution(
            id="glofas",
            name="GloFAS river discharge (Copernicus Emergency Management Service)",
            license="CC-BY-4.0",
            url="https://open-meteo.com/en/docs/flood-api",
            text="River flow: Copernicus GloFAS via Open-Meteo (CC BY 4.0)",
            display_required=True,
        ),
    ]
}
