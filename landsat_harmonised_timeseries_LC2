// Script showing how to obtain a harmonized Landsat Time-Series
// using Landsat Collection 2
// Define the points as a nested array of longitude and latitude pairs
var points = [[	-60.096764	,	-2.341439	],
//...
[	-51.461458	,	-1.743247	],
];
// Create a feature collection from the points
var features = ee.FeatureCollection(
  points.map(function(point) {
    var longitude = point[0];
    var latitude = point[1];
    var geometry = ee.Geometry.Point([longitude, latitude]);
    return ee.Feature(geometry);
  })
);

// Add the feature collection to the map
Map.addLayer(features, {}, 'Points');

// Define the buffer distance in meters
var bufferDistance = 50;

// Create polygons from the centroids
var polygons = features.map(function(feature) {
  var centroid = feature.geometry();
  var polygon = centroid.buffer(bufferDistance).bounds();
  return ee.Feature(polygon);
});

// Add a property to each polygon feature that contains a unique name or ID for that polygon
polygons = polygons.map(function(feature) {
  return feature.set('id', ee.String('polygon_').cat(ee.String(feature.id())));
});


// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Step 1: Select the Landsat dataset
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// We use "Landsat Level 2 Collection 2 Tier-1 Scenes"

// Collection 2 -->
// Landsat Collection 2 algorithm has improved
// geometric and radiometric calibration that makes
// the collections interoperable.
// Learn more at https://www.usgs.gov/landsat-missions/landsat-collection-2

// Level 2 -->
// This is a surface reflectance product and 
// have the highest level of interoperability through time.

// Tier 1 -->
// Highest quality scenes which are considered suitable
// for time-series analysis
var L5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2');
var L7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2');
var L8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Step 2: Data Pre-Processing and Cloud Masking
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Mapping of band-names to a uniform naming scheme
var l5Bands = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var l5names = ['blue','green','red','nir','swir1','swir2'];

var l7Bands = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var l7names = ['blue','green','red','nir','swir1','swir2'];

var l8Bands = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7'];
var l8names = ['blue','green','red','nir','swir1','swir2'];

// Cloud masking function for Landsat 4,5 and 7
function maskL457sr(image) {
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  // Apply the scaling factors to the appropriate bands.
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBand = image.select('ST_B6').multiply(0.00341802).add(149.0);

  // Replace the original bands with the scaled ones and apply the masks.
  return image.addBands(opticalBands, null, true)
      .addBands(thermalBand, null, true)
      .updateMask(qaMask)
      .updateMask(saturationMask)
      .copyProperties(image, ['system:time_start']);
}

// Cloud masking function for Landsat 8
function maskL8sr(image) {
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  // Apply the scaling factors to the appropriate bands.
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);

  // Replace the original bands with the scaled ones and apply the masks.
  return image.addBands(opticalBands, null, true)
      .addBands(thermalBands, null, true)
      .updateMask(qaMask)
      .updateMask(saturationMask)
      .copyProperties(image, ['system:time_start']);
}

// Apply cloud-mask and rename bands
var L5 = L5
  .map(maskL457sr)
  .select(l5Bands,l5names)

var L7 = L7
  .map(maskL457sr)
  .select(l7Bands,l7names)

var L8 = L8
  .map(maskL8sr)
  .select(l8Bands,l8names)
  
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Step 3a: Verify Radiometric Calibration
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// We plot band values from different satellites during
// times when both were operational.

// Compare L5 and L7
var L5Filtered = L5
  .filter(ee.Filter.date('2005-01-01', '2006-01-01'))
  .select(['red', 'nir'], ['red_L5', 'nir_L5']);

var L7Filtered = L7
  .filter(ee.Filter.date('2005-01-01', '2006-01-01'))
  .select(['red', 'nir'], ['red_L7', 'nir_L7']);

var L5L7merged = L5Filtered.merge(L7Filtered)

var chart = ui.Chart.image.series({
  imageCollection: L5L7merged,
  region: polygons,
  reducer: ee.Reducer.mean(),
  scale: 30
}).setChartType('LineChart')
  .setOptions({
    title: 'Landsat 5 vs Landsat 7',
    interpolateNulls: true,
    vAxis: {title: 'Reflectance', viewWindow: {min: 0, max: 0.5}},
    hAxis: {title: '', format: 'YYYY-MM'},
    lineWidth: 1,
    pointSize: 4,
    lineDashStyle: [4, 4]
  })
print(chart);

// Compare L7 and L8
var L7Filtered = L7
  .filter(ee.Filter.date('2016-01-01', '2017-01-01'))
  .select(['red', 'nir'], ['red_L7', 'nir_L7']);

var L8Filtered = L8
  .filter(ee.Filter.date('2016-01-01', '2017-01-01'))
  .select(['red', 'nir'], ['red_L8', 'nir_L8']);

var L7L8merged = L7Filtered.merge(L8Filtered)

var chart = ui.Chart.image.series({
  imageCollection: L7L8merged,
  region: polygons,
  reducer: ee.Reducer.mean(),
  scale: 30
}).setChartType('LineChart')
  .setOptions({
    title: 'Landsat 7 vs Landsat 8',
    interpolateNulls: true,
    vAxis: {title: 'Reflectance', viewWindow: {min: 0, max: 0.5}},
    hAxis: {title: '', format: 'YYYY-MM'},
    lineWidth: 1,
    pointSize: 4,
    lineDashStyle: [4, 4]
  })
print(chart); 
  

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Step 3b: Select Date Ranges, Filter and Merge
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// See the Landsat timeline for date ranges
// https://www.usgs.gov/media/images/landsat-missions-timeline

// Adjust the range depending on your 
// application and location

var l5Start = ee.Date.fromYMD(1984, 03, 16);
var l5End = ee.Date.fromYMD(2012, 5, 5);

var l7Start = ee.Date.fromYMD(1999, 5, 28);
var l7End = ee.Date.fromYMD(2023, 11, 11);

var l8Start = ee.Date.fromYMD(2013, 3, 18);
var l8End = ee.Date.fromYMD(2023, 11, 27);

var L5 = L5
  .filter(ee.Filter.date(l5Start, l5End))
  .filter(ee.Filter.bounds(polygons));

var L7 = L7
  .filter(ee.Filter.date(l7Start, l7End))
  .filter(ee.Filter.bounds(polygons));

var L8 = L8
  .filter(ee.Filter.date(l8Start, l8End))
  .filter(ee.Filter.bounds(polygons));
  
var merged = L5.merge(L7).merge(L8)


// Print chart for first polygon
Map.addLayer(polygons.filter(ee.Filter.eq('id', '6')))
var testPoint = ee.Feature(polygons.first())
Map.centerObject(testPoint, 10)
var chart = ui.Chart.image.series({
    imageCollection: merged.select('blue', 'green', 'red', 'nir','swir1', 'swir2'),
    region: testPoint.geometry()
    }).setOptions({
      interpolateNulls: true,
      lineWidth: 1,
      pointSize: 3,
      title: 'bands over Time at a Single Location',
      vAxis: {title: 'bands'},
      hAxis: {title: 'Date', format: 'YYYY-MMM', gridlines: {count: 12}}

    })
print(chart)


// blue
var triplets = merged.map(function(image) {
  return image.select('blue').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['blue']), 
    scale: 30,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('blue'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'blue': bands, 'imageID': image.id()})
    })
  }).flatten();

var format = function(table, rowId, colId) {
  var rows = table.distinct(rowId); 
  var joined = ee.Join.saveAll('matches').apply({
    primary: rows, 
    secondary: table, 
    condition: ee.Filter.equals({
      leftField: rowId, 
      rightField: rowId
    })
  });
        
  return joined.map(function(row) {
      var values = ee.List(row.get('matches'))
        .map(function(feature) {
          feature = ee.Feature(feature);
          return [feature.get(colId), feature.get('blue')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('blue', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'blue_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'blue']
})

// green
var triplets = merged.map(function(image) {
  return image.select('green').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['green']), 
    scale: 30,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('green'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'green': bands, 'imageID': image.id()})
    })
  }).flatten();

var format = function(table, rowId, colId) {
  var rows = table.distinct(rowId); 
  var joined = ee.Join.saveAll('matches').apply({
    primary: rows, 
    secondary: table, 
    condition: ee.Filter.equals({
      leftField: rowId, 
      rightField: rowId
    })
  });
        
  return joined.map(function(row) {
      var values = ee.List(row.get('matches'))
        .map(function(feature) {
          feature = ee.Feature(feature);
          return [feature.get(colId), feature.get('green')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('green', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'green_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'green']
})


// red
var triplets = merged.map(function(image) {
  return image.select('red').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['red']), 
    scale: 30,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('red'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'red': bands, 'imageID': image.id()})
    })
  }).flatten();

var format = function(table, rowId, colId) {
  var rows = table.distinct(rowId); 
  var joined = ee.Join.saveAll('matches').apply({
    primary: rows, 
    secondary: table, 
    condition: ee.Filter.equals({
      leftField: rowId, 
      rightField: rowId
    })
  });
        
  return joined.map(function(row) {
      var values = ee.List(row.get('matches'))
        .map(function(feature) {
          feature = ee.Feature(feature);
          return [feature.get(colId), feature.get('red')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('red', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'red_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'red']
})


// nir
var triplets = merged.map(function(image) {
  return image.select('nir').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['nir']), 
    scale: 30,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('nir'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'nir': bands, 'imageID': image.id()})
    })
  }).flatten();

var format = function(table, rowId, colId) {
  var rows = table.distinct(rowId); 
  var joined = ee.Join.saveAll('matches').apply({
    primary: rows, 
    secondary: table, 
    condition: ee.Filter.equals({
      leftField: rowId, 
      rightField: rowId
    })
  });
        
  return joined.map(function(row) {
      var values = ee.List(row.get('matches'))
        .map(function(feature) {
          feature = ee.Feature(feature);
          return [feature.get(colId), feature.get('nir')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('nir', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'nir_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'nir']
})


// swir1
var triplets = merged.map(function(image) {
  return image.select('swir1').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['swir1']), 
    scale: 30,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('swir1'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'swir1': bands, 'imageID': image.id()})
    })
  }).flatten();

var format = function(table, rowId, colId) {
  var rows = table.distinct(rowId); 
  var joined = ee.Join.saveAll('matches').apply({
    primary: rows, 
    secondary: table, 
    condition: ee.Filter.equals({
      leftField: rowId, 
      rightField: rowId
    })
  });
        
  return joined.map(function(row) {
      var values = ee.List(row.get('matches'))
        .map(function(feature) {
          feature = ee.Feature(feature);
          return [feature.get(colId), feature.get('swir1')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('swir1', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'swir1_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'swir1']
})


// swir2
var triplets = merged.map(function(image) {
  return image.select('swir2').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['swir2']), 
    scale: 30,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('swir2'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'swir2': bands, 'imageID': image.id()})
    })
  }).flatten();

var format = function(table, rowId, colId) {
  var rows = table.distinct(rowId); 
  var joined = ee.Join.saveAll('matches').apply({
    primary: rows, 
    secondary: table, 
    condition: ee.Filter.equals({
      leftField: rowId, 
      rightField: rowId
    })
  });
        
  return joined.map(function(row) {
      var values = ee.List(row.get('matches'))
        .map(function(feature) {
          feature = ee.Feature(feature);
          return [feature.get(colId), feature.get('swir2')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('swir2', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'swir2_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'swir2']
})
