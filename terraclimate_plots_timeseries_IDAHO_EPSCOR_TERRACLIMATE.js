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


// Adding the desired bands
function addBands(image) {
  var bands = image.select(['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs'])
    .rename(['Actual_evapotranspiration', 'Climate_water_deficit', 'Palmer_Drought_Severity_Index', 
    'Reference_evapotranspiration', 'Precipitation_accumulation', 'Runoff', 'Soil_moisture', 'Downward_surface_shortwave_radiation', 'Minimum_temperature', 
    'Maximum_temperature', 'Vapor_pressure', 'Vapor_pressure_deficit', 'Wind-speed__10m']);
  return image.addBands(bands);
}
var collection = ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE")
var range = collection.reduceColumns(ee.Reducer.minMax(), ['system:time_start'])
var diff = ee.Date(range.get('max')).difference(ee.Date(range.get('min')), 'months');

var month_mean = ee.List.sequence(0, diff).map(function(n) { // .sequence: number of years from starting year to present
  var start = ee.Date(range.get('min')).advance(n, 'month'); // Starting date
  var end = start.advance(1, 'month'); // Step by each iteration

  return collection
        .filterDate(start, end)
        .map(addBands)
        .filter(ee.Filter.bounds(polygons))
        .mean().multiply(0.1) //mm total monthly with 0.1 scaling
        .set('system:time_start', start) })
  
var vizParams = imageVisParam
Map.addLayer(collection.median(), vizParams, 'tmmx')
// Show the plot locations in green
Map.addLayer(polygons, {color: 'green'}, 'plots')

var getImage = function(id) {
  return ee.Image(collection.filter(ee.Filter.eq('system:index', id)).first())
}

var ET = ee.ImageCollection(month_mean).select('tmmx')

Map.addLayer(polygons.filter(ee.Filter.eq('id', '6')))
var testPoint = ee.Feature(polygons.first())

var TimeSeries = ui.Chart.image.series({
    imageCollection: ET,
    region: testPoint,
    scale: 0.1,
    reducer: ee.Reducer.mean(),
    xProperty: 'system:time_start',
  }).setChartType('ScatterChart')
    .setOptions({
      title: 'tmmx TerraClimate',
      vAxis: {title: 'average mm/day'},
      lineWidth: 1,
      pointSize: 1,
    });

print(TimeSeries)


// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('aet').multiply(0.1).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['aet']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('aet'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'aet': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('aet')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('aet', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'aet_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'aet']
})


// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('def').multiply(0.1).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['def']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('def'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'def': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('def')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('def', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'def_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'def']
})



// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('pdsi').multiply(0.01).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['pdsi']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('pdsi'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'pdsi': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('pdsi')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('pdsi', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'pdsi_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'pdsi']
})


// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('pet').multiply(0.1).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['pet']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('pet'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'pet': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('pet')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('pet', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'pet_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'pet']
})



// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('pr').reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['pr']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('pr'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'pr': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('pr')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('pr', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'pr_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'pr']
})


// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('ro').reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['ro']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('ro'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'ro': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('ro')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('ro', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'ro_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'ro']
})

// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('soil').multiply(0.1).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['soil']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('soil'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'soil': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('soil')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('soil', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'soil_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'soil']
})


// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('srad').multiply(0.1).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['srad']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('srad'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'srad': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('srad')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('srad', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'srad_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'srad']
})


// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('tmmn').multiply(0.1).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['tmmn']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('tmmn'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'tmmn': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('tmmn')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('tmmn', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'tmmn_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'tmmn']
})

// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('tmmx').multiply(0.1).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['tmmx']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('tmmx'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'tmmx': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('tmmx')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('tmmx', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'tmmx_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'tmmx']
})

// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('vap').multiply(0.001).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['vap']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('vap'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'vap': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('vap')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('vap', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'vap_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'vap']
})


// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('vpd').multiply(0.01).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['vpd']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('vpd'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'vpd': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('vpd')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('vpd', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'vpd_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'vpd']
})

// ['aet', 'def', 'pdsi', 'pet', 'pr', 'ro', 'soil', 'srad', 'tmmn', 'tmmx', 'vap', 'vpd', 'vs']

// Actual_evapotranspiration 
var triplets = collection.map(function(image) {
  return image.select('vs').multiply(0.01).reduceRegions({
    collection: polygons,
    scale: 0.1,
    reducer: ee.Reducer.mean().setOutputs(['vs']), 
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no value found, we set the value to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('vs'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'vs': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('vs')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,6);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('vs', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'vs_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'vs']
})
