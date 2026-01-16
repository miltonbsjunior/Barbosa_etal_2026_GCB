// Define the points as a nested array of longitude and latitude pairs
var points = [ [	-60.096764	,	-2.341439	],
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

// Cloud masking
function maskCloudAndShadows(image) {
  var cloudProb = image.select('MSK_CLDPRB');
  var snowProb = image.select('MSK_SNWPRB');
  var cloud = cloudProb.lt(5);
  var snow = snowProb.lt(5);
  var scl = image.select('SCL'); 
  var shadow = scl.eq(3); // 3 = cloud shadow
  var cirrus = scl.eq(10); // 10 = cirrus
  // Cloud probability less than 5% or cloud shadow classification
  var mask = (cloud.and(snow)).and(cirrus.neq(1)).and(shadow.neq(1));
  return image.updateMask(mask);
}

// Adding the desired bands
function addBands(image) {
  var bands = image.select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'])
    .rename(['blue', 'green', 'red', 'red_edge1', 'red_edge2', 'red_edge3', 'nir', 'red_edge4', 'swir1', 'swir2']);
  return image.addBands(bands);
}

var startDate = '2019-01-01'
var endDate = '2022-12-31'

// Use Sentinel-2 L2A data - which has better cloud masking
var collection = ee.ImageCollection('COPERNICUS/S2_SR')
    .filterDate(startDate, endDate)
    .map(maskCloudAndShadows)
    .map(addBands)
    .filter(ee.Filter.bounds(polygons))

// // View the median composite
// var vizParams = {bands: ['B2', 'B3', 'B4'], min: 0, max: 2000}
// Map.addLayer(collection.median(), vizParams, 'collection')
// // Show the farm locations in green
// Map.addLayer(polygons, {color: 'green'}, 'Miniplots')

// var getImage = function(id) {
//   return ee.Image(collection.filter(ee.Filter.eq('system:index', id)).first())
// }

// Map.addLayer(polygons.filter(ee.Filter.eq('id', '6')))
// var testPoint = ee.Feature(polygons.first())
// //Map.centerObject(testPoint, 10)
// var chart = ui.Chart.image.series({
//     imageCollection: collection.select('blue', 'green', 'red', 'red_edge1', 'red_edge2', 'red_edge3', 'nir', 'red_edge4', 'swir1', 'swir2'),
//     region: testPoint.geometry()
//     }).setOptions({
//       interpolateNulls: true,
//       lineWidth: 1,
//       pointSize: 3,
//       title: 'bands over Time at a Single Location',
//       vAxis: {title: 'bands'},
//       hAxis: {title: 'Date', format: 'YYYY-MMM', gridlines: {count: 12}}

//     })
// print(chart)


// red
var triplets = collection.map(function(image) {
  return image.select('red').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['red']), 
    scale: 10,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no ndvi value found, we set the ndvi to a NoData value -9999
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
  var date = ee.String(imageID).slice(0,8);
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

var sentinelResults = format(triplets, 'id', 'imageID');
// There are multiple image granules for the same date processed from the same orbit
// Granules overlap with each other and since they are processed independently
// the pixel values can differ slightly. So the same pixel can have different NDVI 
// values for the same date from overlapping granules.
// So to simplify the output, we can merge observations for each day
// And take the max ndvi value from overlapping observations
var merge = function(table, rowId) {
  return table.map(function(feature) {
    var id = feature.get(rowId)
    var allKeys = feature.toDictionary().keys().remove(rowId)
    var substrKeys = ee.List(allKeys.map(function(val) { 
        return ee.String(val).slice(0,8)}
        ))
    var uniqueKeys = substrKeys.distinct()
    var pairs = uniqueKeys.map(function(key) {
      var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
      var val = matches.reduce(ee.Reducer.max())
      return [key, val]
    })
    return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
  })
}
var sentinelMerged = merge(sentinelResults, 'id');
Export.table.toDrive({
    collection: sentinelMerged,
    description: 'Multiple_Locations_bands_time_series_Wide',
    folder: 'earthengine',
    fileNamePrefix: 'red_time_series_multiple_wide',
    fileFormat: 'CSV'
})




// blue
var triplets = collection.map(function(image) {
  return image.select('blue').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['blue']), 
    scale: 10,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no ndvi value found, we set the ndvi to a NoData value -9999
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
  var date = ee.String(imageID).slice(0,8);
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

var sentinelResults = format(triplets, 'id', 'imageID');
// There are multiple image granules for the same date processed from the same orbit
// Granules overlap with each other and since they are processed independently
// the pixel values can differ slightly. So the same pixel can have different NDVI 
// values for the same date from overlapping granules.
// So to simplify the output, we can merge observations for each day
// And take the max ndvi value from overlapping observations
var merge = function(table, rowId) {
  return table.map(function(feature) {
    var id = feature.get(rowId)
    var allKeys = feature.toDictionary().keys().remove(rowId)
    var substrKeys = ee.List(allKeys.map(function(val) { 
        return ee.String(val).slice(0,8)}
        ))
    var uniqueKeys = substrKeys.distinct()
    var pairs = uniqueKeys.map(function(key) {
      var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
      var val = matches.reduce(ee.Reducer.max())
      return [key, val]
    })
    return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
  })
}
var sentinelMerged = merge(sentinelResults, 'id');
Export.table.toDrive({
    collection: sentinelMerged,
    description: 'Multiple_Locations_bands_time_series_Wide',
    folder: 'earthengine',
    fileNamePrefix: 'blue_time_series_multiple_wide',
    fileFormat: 'CSV'
})



// green
var triplets = collection.map(function(image) {
  return image.select('green').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['green']), 
    scale: 10,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no ndvi value found, we set the ndvi to a NoData value -9999
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
  var date = ee.String(imageID).slice(0,8);
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

var sentinelResults = format(triplets, 'id', 'imageID');
// There are multiple image granules for the same date processed from the same orbit
// Granules overlap with each other and since they are processed independently
// the pixel values can differ slightly. So the same pixel can have different NDVI 
// values for the same date from overlapping granules.
// So to simplify the output, we can merge observations for each day
// And take the max ndvi value from overlapping observations
var merge = function(table, rowId) {
  return table.map(function(feature) {
    var id = feature.get(rowId)
    var allKeys = feature.toDictionary().keys().remove(rowId)
    var substrKeys = ee.List(allKeys.map(function(val) { 
        return ee.String(val).slice(0,8)}
        ))
    var uniqueKeys = substrKeys.distinct()
    var pairs = uniqueKeys.map(function(key) {
      var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
      var val = matches.reduce(ee.Reducer.max())
      return [key, val]
    })
    return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
  })
}
var sentinelMerged = merge(sentinelResults, 'id');
Export.table.toDrive({
    collection: sentinelMerged,
    description: 'Multiple_Locations_bands_time_series_Wide',
    folder: 'earthengine',
    fileNamePrefix: 'green_time_series_multiple_wide',
    fileFormat: 'CSV'
})



// red_edge1
var triplets = collection.map(function(image) {
  return image.select('red_edge1').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['red_edge1']), 
    scale: 10,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no ndvi value found, we set the ndvi to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('red_edge1'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'red_edge1': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('red_edge1')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,8);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('red_edge1', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'red_edge1_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'red_edge1']
})

var sentinelResults = format(triplets, 'id', 'imageID');
// There are multiple image granules for the same date processed from the same orbit
// Granules overlap with each other and since they are processed independently
// the pixel values can differ slightly. So the same pixel can have different NDVI 
// values for the same date from overlapping granules.
// So to simplify the output, we can merge observations for each day
// And take the max ndvi value from overlapping observations
var merge = function(table, rowId) {
  return table.map(function(feature) {
    var id = feature.get(rowId)
    var allKeys = feature.toDictionary().keys().remove(rowId)
    var substrKeys = ee.List(allKeys.map(function(val) { 
        return ee.String(val).slice(0,8)}
        ))
    var uniqueKeys = substrKeys.distinct()
    var pairs = uniqueKeys.map(function(key) {
      var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
      var val = matches.reduce(ee.Reducer.max())
      return [key, val]
    })
    return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
  })
}
var sentinelMerged = merge(sentinelResults, 'id');
Export.table.toDrive({
    collection: sentinelMerged,
    description: 'Multiple_Locations_bands_time_series_Wide',
    folder: 'earthengine',
    fileNamePrefix: 'red_edge1_time_series_multiple_wide',
    fileFormat: 'CSV'
})



// red_edge2
var triplets = collection.map(function(image) {
  return image.select('red_edge2').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['red_edge2']), 
    scale: 10,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no ndvi value found, we set the ndvi to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('red_edge2'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'red_edge2': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('red_edge2')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,8);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('red_edge2', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'red_edge2_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'red_edge2']
})

var sentinelResults = format(triplets, 'id', 'imageID');
// There are multiple image granules for the same date processed from the same orbit
// Granules overlap with each other and since they are processed independently
// the pixel values can differ slightly. So the same pixel can have different NDVI 
// values for the same date from overlapping granules.
// So to simplify the output, we can merge observations for each day
// And take the max ndvi value from overlapping observations
var merge = function(table, rowId) {
  return table.map(function(feature) {
    var id = feature.get(rowId)
    var allKeys = feature.toDictionary().keys().remove(rowId)
    var substrKeys = ee.List(allKeys.map(function(val) { 
        return ee.String(val).slice(0,8)}
        ))
    var uniqueKeys = substrKeys.distinct()
    var pairs = uniqueKeys.map(function(key) {
      var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
      var val = matches.reduce(ee.Reducer.max())
      return [key, val]
    })
    return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
  })
}
var sentinelMerged = merge(sentinelResults, 'id');
Export.table.toDrive({
    collection: sentinelMerged,
    description: 'Multiple_Locations_bands_time_series_Wide',
    folder: 'earthengine',
    fileNamePrefix: 'red_edge2_time_series_multiple_wide',
    fileFormat: 'CSV'
})



// red_edge3
var triplets = collection.map(function(image) {
  return image.select('red_edge3').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['red_edge3']), 
    scale: 10,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no ndvi value found, we set the ndvi to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('red_edge3'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'red_edge3': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('red_edge3')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,8);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('red_edge3', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'red_edge3_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'red_edge3']
})

var sentinelResults = format(triplets, 'id', 'imageID');
// There are multiple image granules for the same date processed from the same orbit
// Granules overlap with each other and since they are processed independently
// the pixel values can differ slightly. So the same pixel can have different NDVI 
// values for the same date from overlapping granules.
// So to simplify the output, we can merge observations for each day
// And take the max ndvi value from overlapping observations
var merge = function(table, rowId) {
  return table.map(function(feature) {
    var id = feature.get(rowId)
    var allKeys = feature.toDictionary().keys().remove(rowId)
    var substrKeys = ee.List(allKeys.map(function(val) { 
        return ee.String(val).slice(0,8)}
        ))
    var uniqueKeys = substrKeys.distinct()
    var pairs = uniqueKeys.map(function(key) {
      var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
      var val = matches.reduce(ee.Reducer.max())
      return [key, val]
    })
    return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
  })
}
var sentinelMerged = merge(sentinelResults, 'id');
Export.table.toDrive({
    collection: sentinelMerged,
    description: 'Multiple_Locations_bands_time_series_Wide',
    folder: 'earthengine',
    fileNamePrefix: 'red_edge3_time_series_multiple_wide',
    fileFormat: 'CSV'
})




// nir
var triplets = collection.map(function(image) {
  return image.select('nir').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['nir']), 
    scale: 10,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no ndvi value found, we set the ndvi to a NoData value -9999
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
  var date = ee.String(imageID).slice(0,8);
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

var sentinelResults = format(triplets, 'id', 'imageID');
// There are multiple image granules for the same date processed from the same orbit
// Granules overlap with each other and since they are processed independently
// the pixel values can differ slightly. So the same pixel can have different NDVI 
// values for the same date from overlapping granules.
// So to simplify the output, we can merge observations for each day
// And take the max ndvi value from overlapping observations
var merge = function(table, rowId) {
  return table.map(function(feature) {
    var id = feature.get(rowId)
    var allKeys = feature.toDictionary().keys().remove(rowId)
    var substrKeys = ee.List(allKeys.map(function(val) { 
        return ee.String(val).slice(0,8)}
        ))
    var uniqueKeys = substrKeys.distinct()
    var pairs = uniqueKeys.map(function(key) {
      var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
      var val = matches.reduce(ee.Reducer.max())
      return [key, val]
    })
    return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
  })
}
var sentinelMerged = merge(sentinelResults, 'id');
Export.table.toDrive({
    collection: sentinelMerged,
    description: 'Multiple_Locations_bands_time_series_Wide',
    folder: 'earthengine',
    fileNamePrefix: 'nir_time_series_multiple_wide',
    fileFormat: 'CSV'
})

 
 
// red_edge4
var triplets = collection.map(function(image) {
  return image.select('red_edge4').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['red_edge4']), 
    scale: 10,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no ndvi value found, we set the ndvi to a NoData value -9999
    .map(function(feature) {
    var bands = ee.List([feature.get('red_edge4'), -9999])
      .reduce(ee.Reducer.firstNonNull())
    return feature.set({'red_edge4': bands, 'imageID': image.id()})
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
          return [feature.get(colId), feature.get('red_edge4')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

// The result is a 'tall' table. We can further process it to 
// extract the date from the imageID property.
var tripletsWithDate = triplets.map(function(f) {
  var imageID = f.get('imageID');
  var date = ee.String(imageID).slice(0,8);
  return f.set('date', date)
})

// We can export this tall table.

// For a cleaner table, we can also filter out
// null values, remove duplicates and sort the table
// before exporting.
var tripletsFiltered = tripletsWithDate
  .filter(ee.Filter.neq('red_edge4', -9999))
  .distinct(['id', 'date'])
  .sort('id');
  
// Specify the columns that we want to export
Export.table.toDrive({
    collection: tripletsFiltered,
    description: 'Multiple_Locations_bands_time_series_Tall',
    folder: 'earthengine',
    fileNamePrefix: 'red_edge4_time_series_multiple_tall',
    fileFormat: 'CSV',
    selectors: ['id', 'date', 'red_edge4']
})

var sentinelResults = format(triplets, 'id', 'imageID');
// There are multiple image granules for the same date processed from the same orbit
// Granules overlap with each other and since they are processed independently
// the pixel values can differ slightly. So the same pixel can have different NDVI 
// values for the same date from overlapping granules.
// So to simplify the output, we can merge observations for each day
// And take the max ndvi value from overlapping observations
var merge = function(table, rowId) {
  return table.map(function(feature) {
    var id = feature.get(rowId)
    var allKeys = feature.toDictionary().keys().remove(rowId)
    var substrKeys = ee.List(allKeys.map(function(val) { 
        return ee.String(val).slice(0,8)}
        ))
    var uniqueKeys = substrKeys.distinct()
    var pairs = uniqueKeys.map(function(key) {
      var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
      var val = matches.reduce(ee.Reducer.max())
      return [key, val]
    })
    return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
  })
}
var sentinelMerged = merge(sentinelResults, 'id');
Export.table.toDrive({
    collection: sentinelMerged,
    description: 'Multiple_Locations_bands_time_series_Wide',
    folder: 'earthengine',
    fileNamePrefix: 'red_edge4_time_series_multiple_wide',
    fileFormat: 'CSV'
})



//swir1
var triplets = collection.map(function(image) {
  return image.select('swir1').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['swir1']), 
    scale: 10,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no ndvi value found, we set the ndvi to a NoData value -9999
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
  var date = ee.String(imageID).slice(0,8);
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

var sentinelResults = format(triplets, 'id', 'imageID');
// There are multiple image granules for the same date processed from the same orbit
// Granules overlap with each other and since they are processed independently
// the pixel values can differ slightly. So the same pixel can have different NDVI 
// values for the same date from overlapping granules.
// So to simplify the output, we can merge observations for each day
// And take the max ndvi value from overlapping observations
var merge = function(table, rowId) {
  return table.map(function(feature) {
    var id = feature.get(rowId)
    var allKeys = feature.toDictionary().keys().remove(rowId)
    var substrKeys = ee.List(allKeys.map(function(val) { 
        return ee.String(val).slice(0,8)}
        ))
    var uniqueKeys = substrKeys.distinct()
    var pairs = uniqueKeys.map(function(key) {
      var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
      var val = matches.reduce(ee.Reducer.max())
      return [key, val]
    })
    return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
  })
}
var sentinelMerged = merge(sentinelResults, 'id');
Export.table.toDrive({
    collection: sentinelMerged,
    description: 'Multiple_Locations_bands_time_series_Wide',
    folder: 'earthengine',
    fileNamePrefix: 'swir1_time_series_multiple_wide',
    fileFormat: 'CSV'
})


// swir2

var triplets = collection.map(function(image) {
  return image.select('swir2').reduceRegions({
    collection: polygons, 
    reducer: ee.Reducer.mean().setOutputs(['swir2']), 
    scale: 10,
  })// reduceRegion doesn't return any output if the image doesn't intersect
    // with the point or if the image is masked out due to cloud
    // If there was no ndvi value found, we set the ndvi to a NoData value -9999
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
  var date = ee.String(imageID).slice(0,8);
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

var sentinelResults = format(triplets, 'id', 'imageID');
// There are multiple image granules for the same date processed from the same orbit
// Granules overlap with each other and since they are processed independently
// the pixel values can differ slightly. So the same pixel can have different NDVI 
// values for the same date from overlapping granules.
// So to simplify the output, we can merge observations for each day
// And take the max ndvi value from overlapping observations
var merge = function(table, rowId) {
  return table.map(function(feature) {
    var id = feature.get(rowId)
    var allKeys = feature.toDictionary().keys().remove(rowId)
    var substrKeys = ee.List(allKeys.map(function(val) { 
        return ee.String(val).slice(0,8)}
        ))
    var uniqueKeys = substrKeys.distinct()
    var pairs = uniqueKeys.map(function(key) {
      var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
      var val = matches.reduce(ee.Reducer.max())
      return [key, val]
    })
    return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
  })
}
var sentinelMerged = merge(sentinelResults, 'id');
Export.table.toDrive({
    collection: sentinelMerged,
    description: 'Multiple_Locations_bands_time_series_Wide',
    folder: 'earthengine',
    fileNamePrefix: 'swir2_time_series_multiple_wide',
    fileFormat: 'CSV'
})
