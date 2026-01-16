# Remote Sensing & Climate Time Series at Plot / Miniplot Locations

This repository contains Google Earth Engine (GEE) scripts used to derive **remote sensing** and **climate** time series over plot and miniplot locations for the associated manuscript (Barbosa et al., Global Change Biology).

The scripts:

* Harmonize **Landsat Collection 2** surface reflectance across sensors
* Extract **Sentinel-2 L2A** spectral bands and vegetation indices at miniplots
* Extract **TerraClimate** monthly climate and water-balance variables at plots
* Export results as CSV tables suitable for statistical analysis

All scripts are written for the **GEE JavaScript API** and are designed to run in the **GEE Code Editor**.

---

## Repository contents

### 1. `landsat_harmonized_timeseries_LC2.js`

**Purpose**
Builds a **harmonized Landsat surface reflectance time series** over a set of locations using **Landsat Collection 2 Level-2 Tier-1** scenes (Landsat 5, 7, and 8).

**Key steps**

* Converts provided point coordinates into buffer polygons (e.g. 50 m radius) and assigns unique polygon IDs (`id`).
* Loads:

  * `LANDSAT/LT05/C02/T1_L2`
  * `LANDSAT/LE07/C02/T1_L2`
  * `LANDSAT/LC08/C02/T1_L2`
* Applies cloud & saturation masking and official scaling factors.
* Renames bands for sensor harmonization:
  `blue`, `green`, `red`, `nir`, `swir1`, `swir2`.
* Checks radiometric consistency between sensors (L5 vs L7, L7 vs L8) with diagnostic charts.
* Merges L5, L7, L8 into a single harmonized time series.

**Outputs**

For each band (`blue`, `green`, `red`, `nir`, `swir1`, `swir2`):

* **Tall format** CSV (one row per polygon × image):

  * `*_time_series_multiple_tall.csv`
  * Columns: `id`, `date`, `<band>`
* **(In that script) time series plots** for visual diagnostics at a single polygon.

---

### 2. `sentinel2_miniplots_timeseries_S2_SR.js`

**Purpose**
Extracts **Sentinel-2 L2A spectral band time series** for small **miniplot** polygons (e.g. buffer = 5 m) using `COPERNICUS/S2_SR`.

**Key steps**

* Converts lon/lat pairs to miniplot polygons and assigns `id`.
* Uses `COPERNICUS/S2_SR` and filters to a specified period (e.g. 2019–2022).
* Applies cloud/snow/shadow masking using:

  * `MSK_CLDPRB`, `MSK_SNWPRB`, and `SCL` (scene classification).
* Adds and renames spectral bands:
  `blue`, `green`, `red`, `red_edge1`, `red_edge2`, `red_edge3`, `nir`, `red_edge4`, `swir1`, `swir2`.
* Optionally plots multi-band time series at one miniplot for diagnostics.

**Outputs**

For each chosen band (script currently implemented for `red`, but pattern is generic):

* **Tall format**:

  * `red_time_series_multiple_tall.csv`
  * Columns: `id`, `date` (`YYYYMMDD`), `red`
* **Wide format** (per polygon, one column per date):

  * `red_time_series_multiple_wide.csv`
  * One row per polygon; columns: `id`, then one column per date (max value across overlapping granules)

The same pattern can be applied to other bands by cloning the `red` block.

---

### 3. `sentinel2_miniplots_indices_timeseries_S2_SR.js`

**Purpose**
Computes **vegetation and moisture indices** from Sentinel-2 L2A at miniplots and exports **NDMI** time series (with the same pattern applicable to other indices).

**Indices calculated**

Using `COPERNICUS/S2_SR`:

* **NDVI** – normalized difference vegetation index (`ndvi`)
* **EVI** – enhanced vegetation index (`evi`)
* **MSAVI** – modified soil-adjusted vegetation index (`msavi`)
* **NDMI** – normalized difference moisture index (`ndmi`)
* **NDRE** – normalized difference red-edge index (`ndre`)

All indices are added as new bands to each image.

**Key steps**

* Same miniplot construction and cloud/snow/shadow masking as in script 2.
* Time window (e.g. 2019–2022).
* Visualization of **NDMI** time series at one miniplot to inspect temporal dynamics.

**Outputs** (currently implemented for NDMI)

* **Tall format**:

  * `ndmi_time_series_multiple_tall.csv`
  * Columns: `id`, `date` (`YYYYMMDD`), `ndmi`
* **Wide format**:

  * `ndmi_time_series_multiple_wide.csv`
  * One row per polygon, one column per date (max NDMI from overlapping granules)

Other indices (NDVI, EVI, MSAVI, NDRE) can be exported by copying the NDMI export blocks and substituting the band name.

---

### 4. `terraclimate_plots_timeseries_IDAHO_EPSCOR_TERRACLIMATE.js`

**Purpose**
Extracts **monthly TerraClimate** time series for each plot polygon from `IDAHO_EPSCOR/TERRACLIMATE`.

**Variables**

TerraClimate bands used:

* `aet` – Actual evapotranspiration
* `def` – Climatic water deficit
* `pdsi` – Palmer Drought Severity Index
* `pet` – Reference evapotranspiration
* `pr` – Precipitation accumulation
* `ro` – Runoff
* `soil` – Soil moisture
* `srad` – Surface shortwave radiation
* `tmmn` – Minimum temperature
* `tmmx` – Maximum temperature
* `vap` – Vapor pressure
* `vpd` – Vapor pressure deficit
* `vs` – 10 m wind speed

Some variables are rescaled using TerraClimate’s scale factors (e.g. ×0.1, ×0.01, ×0.001), as in the script.

**Key steps**

* Converts plot points to 50 m buffer polygons, assigns `id`.
* Computes overall collection time range and (optionally) builds monthly means.
* Produces a diagnostic time series chart (e.g. `tmmx`) at one plot.
* For each variable:

  * Uses `reduceRegions` to compute monthly mean over each polygon.
  * Fills missing values with `-9999`.
  * Derives a `date` string (`YYYYMM`) from `imageID`.

**Outputs** (one **tall** CSV per variable)

Examples:

* `aet_time_series_multiple_tall.csv`
* `def_time_series_multiple_tall.csv`
* `pdsi_time_series_multiple_tall.csv`
* `pet_time_series_multiple_tall.csv`
* `pr_time_series_multiple_tall.csv`
* `ro_time_series_multiple_tall.csv`
* `soil_time_series_multiple_tall.csv`
* `srad_time_series_multiple_tall.csv`
* `tmmn_time_series_multiple_tall.csv`
* `tmmx_time_series_multiple_tall.csv`
* `vap_time_series_multiple_tall.csv`
* `vpd_time_series_multiple_tall.csv`
* `vs_time_series_multiple_tall.csv`

Each with columns:

* `id` – polygon ID
* `date` – TerraClimate month (`YYYYMM`)
* `<variable>` – monthly mean at that plot and month

---

### 5. `sentinel2_plots_timeseries_bands_S2_SR_amazon.js`

**Purpose**
Extracts **Sentinel-2 L2A spectral band time series** over Amazon forest plot polygons (larger buffers, e.g. 50 m), including all key spectral bands and exporting **both tall and wide tables** for each band.

**Key steps**

* Uses Amazon plot coordinates (lon/lat) → 50 m buffer polygons, with `id`.
* Uses `COPERNICUS/S2_SR` and the same `maskCloudAndShadows` and `addBands` logic as above.
* Time window: typically 2019–2022 (configurable).
* For each band:

  `blue`, `green`, `red`,
  `red_edge1`, `red_edge2`, `red_edge3`, `nir`, `red_edge4`,
  `swir1`, `swir2`

  the script:

  * Computes mean reflectance per polygon and image (tall format).
  * Constructs a wide table per polygon by aggregating overlapping granules per day (max reflectance).

**Outputs** (per band)

* **Tall CSV**:

  * `<band>_time_series_multiple_tall.csv`
  * Columns: `id`, `date` (`YYYYMMDD`), `<band>`
* **Wide CSV**:

  * `<band>_time_series_multiple_wide.csv`
  * One row per polygon, one column per date (aggregated value)

---

## Common usage instructions

1. **Prerequisites**

   * Valid **Google Earth Engine** account.
   * Access to the **GEE Code Editor**:
     [https://code.earthengine.google.com](https://code.earthengine.google.com)

2. **Running a script**

   * Open the Code Editor and create a new script.
   * Paste the contents of the chosen `.js` file.
   * Check and edit:

     * `points` array (your coordinates, if different).
     * `bufferDistance` (plot / miniplot size).
     * `startDate` / `endDate` (for Sentinel-2 scripts).
   * Click **Run**.
   * In the **Tasks** tab, click **Run** on each export and confirm the settings.

3. **Outputs**

   * All scripts export tables to Google Drive, typically under folder:
     `earthengine/`
   * Download the CSVs and link them to your field trait / plot data via polygon `id`.

4. **Tall vs wide formats (Sentinel-2 scripts)**

   * **Tall**: each row = polygon × date; easy to join with other site-by-date variables.
   * **Wide**: each row = polygon; one column per date; convenient for time-series matrices.

---

## Linking code and data (Zenodo / GCB data availability)

* The **code** in this repository corresponds to the processing workflows for:

  * Harmonized Landsat C2 reflectance
  * Sentinel-2 spectral bands and indices
  * TerraClimate monthly climate variables

* The **derived data products** (CSV files exported by these scripts) are archived separately (e.g. in a Zenodo dataset) and referenced in the manuscript’s **Data Availability** statement.

Example wording you can adapt:

> “Remote sensing and climate time series at plot and miniplot locations were derived using Google Earth Engine scripts archived in this repository. The resulting CSV datasets (Landsat, Sentinel-2 spectral bands and indices, and TerraClimate variables) are openly available at [Zenodo DOI].”

---

## Citation

If you use these scripts, please cite:
* Milton Barbosa. (2026). miltonbsjunior/barbosa_etal_2026_GCB_remore_sensing: v1.0.0 (GCB submission) (v1.0.0). Zenodo. https://doi.org/10.5281/zenodo.18268845

Also cite:
* The associated manuscript (Barbosa et al., Global Change Biology, **[update with year/DOI]**).
* The underlying data products:

  * Landsat Collection 2 (USGS/NASA)
  * Sentinel-2 Level-2A (Copernicus / ESA)
  * TerraClimate (Abatzoglou et al.)

