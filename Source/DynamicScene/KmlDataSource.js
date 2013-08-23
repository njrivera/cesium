/*global define*/
define(['../Core/createGuid',
        '../Core/defined',
        '../Core/Cartographic',
        '../Core/Cartesian2',
        '../Core/Color',
        '../Core/ClockRange',
        '../Core/ClockStep',
        '../Core/DeveloperError',
        '../Core/RuntimeError',
        '../Core/Ellipsoid',
        '../Core/Event',
        '../Core/Iso8601',
        '../Core/loadXML',
        './ConstantProperty',
        './DynamicProperty',
        './DynamicMaterialProperty',
        './DynamicClock',
        './DynamicObject',
        './DynamicObjectCollection',
        './DynamicPoint',
        './DynamicPolyline',
        './DynamicPolygon',
        './DynamicLabel',
        './DynamicBillboard',
        '../ThirdParty/when',
        '../ThirdParty/Uri'
    ], function(
        createGuid,
        defined,
        Cartographic,
        Cartesian2,
        Color,
        ClockRange,
        ClockStep,
        DeveloperError,
        RuntimeError,
        Ellipsoid,
        Event,
        Iso8601,
        loadXML,
        ConstantProperty,
        DynamicProperty,
        DynamicMaterialProperty,
        DynamicClock,
        DynamicObject,
        DynamicObjectCollection,
        DynamicPoint,
        DynamicPolyline,
        DynamicPolygon,
        DynamicLabel,
        DynamicBillboard,
        when,
        Uri) {
    "use strict";

    //Copied from GeoJsonDataSource
    var ConstantPositionProperty = function(value) {
        this._value = value;
    };

    ConstantPositionProperty.prototype.getValueCartesian = function(time, result) {
        var value = this._value;
        if (typeof value.clone === 'function') {
            return value.clone(result);
        }
        return value;
    };

    ConstantPositionProperty.prototype.setValue = function(value) {
        this._value = value;
    };

    var scratch = new Cartographic();

    //Helper functions
    function readCoordinate(element) {
        var digits = element.textContent.trim().split(/[\s,\n]+/g);
        var cartographic = Cartographic.fromDegrees(digits[0], digits[1], parseFloat(digits[2]), scratch);
        return Ellipsoid.WGS84.cartographicToCartesian(cartographic);
    }

    function readCoordinates(element) {
        var digits = element.textContent.trim().split(/[\s,\n]+/g);
        var numberOfCoordinates = digits.length / 3;
        var result = new Array(numberOfCoordinates);
        var resultIndex = 0;
        var cartographic;
        for ( var i = 0; i < digits.length; i += 3) {
            cartographic = Cartographic.fromDegrees(parseFloat(digits[i]), parseFloat(digits[i+1]), parseFloat(digits[i+2]), scratch);
            result[resultIndex] = Ellipsoid.WGS84.cartographicToCartesian(cartographic);
            resultIndex++;
        }
        return result;
    }

    function coordinatesArrayToCartesianArray(coordinates) {
        var positions = new Array(coordinates.length);
        for ( var i = 0; i < coordinates.length; i++) {
            var cartographic = Cartographic.fromDegrees(coordinates[i][0], coordinates[i][1], coordinates[i][2]);
            positions[i] = Ellipsoid.WGS84.cartographicToCartesian(cartographic);
        }
        return positions;
    }

    function equalCoordinateTuples(tuple1, tuple2){
        return tuple1[0] === tuple2[0] && tuple1[1] === tuple2[1] && tuple1[2] === tuple2[2];
    }

    function getNumericValue(node, tagName){
        var element = node.getElementsByTagName(tagName)[0];
        return defined(element) ? parseFloat(element.firstChild.data) : undefined;
    }

    function getStringValue(node, tagName){
        var element = node.getElementsByTagName(tagName)[0];
        var value = defined(element) ? element.firstChild.data : undefined;
        return value;
    }

    function getColorValue(node, tagName){
        var red, green, blue, alpha;
        var element = node.getElementsByTagName(tagName)[0];
        var colorModeNode = node.getElementsByTagName('colorMode')[0];
        var value = defined(element)  ? element.firstChild.data : undefined;
        if (!defined(value)){
            return new Color(1.0, 1.0, 1.0, 1.0); //white as default?
        }
        var colorMode = defined(colorModeNode) ? colorModeNode.firstChild.data : undefined;
        if(colorMode === 'random'){
            var options = {};
            options.blue = parseInt(value.substring(2,4), 16)  / 255.0;
            options.green = parseInt(value.substring(4,6), 16) / 255.0;
            options.red = parseInt(value.substring(6,8), 16) / 255.0;
            var color = Color.fromRandom(options);
            color.alpha = parseInt(value.substring(0,2), 16) / 255.0;
            return color;
        }
        //normal mode as default
        alpha = parseInt(value.substring(0,2), 16) / 255.0;
        blue = parseInt(value.substring(2,4), 16)  / 255.0;
        green = parseInt(value.substring(4,6), 16) / 255.0;
        red = parseInt(value.substring(6,8), 16) / 255.0;
        return new Color(red, green, blue, alpha);
    }

    // KML processing functions
    function processPlacemark(dataSource, dynamicObject, placemark, dynamicObjectCollection, styleCollection) {
        dynamicObject.name = getStringValue(placemark, 'name');
        if(defined(dynamicObject.label)){
            dynamicObject.label.text = new ConstantProperty(dynamicObject.name);
        }
        // I want to iterate over every placemark
        for(var i = 0, len = placemark.childNodes.length; i < len; i++){
            var node = placemark.childNodes.item(i);
            //Checking if the node holds a supported Geometry type
            if(geometryTypes.hasOwnProperty(node.nodeName)){
                placemark.geometry = node.nodeName;
                var geometryType = placemark.geometry;
                var geometryHandler = geometryTypes[geometryType];
                if (!defined(geometryHandler)) {
                    throw new DeveloperError('Unknown geometry type: ' + geometryType);
                }
                geometryHandler(dataSource, dynamicObject, placemark, node, dynamicObjectCollection);
            }
        }

    }

    function processPoint(dataSource, dynamicObject, kml, node) {
        //TODO extrude, altitudeMode, gx:altitudeMode
        var el = node.getElementsByTagName('coordinates');

        var cartesian3 = readCoordinate(el[0]);
        dynamicObject.position = new ConstantPositionProperty(cartesian3);
    }

    function processLineString(dataSource, dynamicObject, kml, node){
        //TODO gx:altitudeOffset, extrude, tessellate, altitudeMode, gx:altitudeMode, gx:drawOrder
        var el = node.getElementsByTagName('coordinates');
        var coordinates = readCoordinates(el[0]);

        dynamicObject.vertexPositions = new ConstantPositionProperty(coordinates);
    }

    function processLinearRing(dataSource, dynamicObject, kml, node){
      //TODO gx:altitudeOffset, extrude, tessellate, altitudeMode, altitudeModeEnum
        var el = node.getElementsByTagName('coordinates');
        var coordinates = readCoordinates(el[0]);

        if (!equalCoordinateTuples(coordinates[0], coordinates[el.length -1])){
            throw new DeveloperError("The first and last coordinate tuples must be the same.");
        }
        dynamicObject.vertexPositions = new ConstantPositionProperty(coordinates);
    }

    function processPolygon(dataSource, dynamicObject, kml, node){
        //TODO innerBoundaryIS, extrude, tessellate, altitudeMode
        var el = node.getElementsByTagName('outerBoundaryIs');
        for (var j = 0; j < el.length; j++) {
            processLinearRing(dataSource, dynamicObject, kml, el[j]);
        }
        var polygon = new DynamicPolygon();
        polygon.material = new DynamicMaterialProperty();
        polygon.material.processCzmlIntervals({
            solidColor : {
                color : {
                    rgba : [255, 255, 255, 255]
                }
            }
        }, undefined, undefined);
        dynamicObject.polygon = polygon;
    }

    function processMultiGeometry(dataSource, dynamicObject, kml, node, dynamicObjectCollection){
        var geometryObject = dynamicObject;
        var styleObject = dynamicObject;
        // I want to iterate over every placemark
        for(var i = 0, len = node.childNodes.length; i < len; i++){
            var innerNode = node.childNodes.item(i);
            //Checking if the node holds a supported Geometry type
            if(geometryTypes.hasOwnProperty(innerNode.nodeName)){
                kml.geometry = innerNode.nodeName;
                var geometryType = kml.geometry;
                var geometryHandler = geometryTypes[geometryType];
                if (!defined(geometryHandler)) {
                    throw new DeveloperError('Unknown geometry type: ' + geometryType);
                }
                //only create a new dynamicObject if the placemark's object was used already
                if (!defined(geometryObject)){
                    var innerNodeId = defined(innerNode.id) ? innerNode.id : createGuid();
                    geometryObject = dynamicObjectCollection.getOrCreateObject(innerNodeId);
                    DynamicBillboard.mergeProperties(geometryObject, styleObject);
                    DynamicLabel.mergeProperties(geometryObject, styleObject);
                    DynamicPoint.mergeProperties(geometryObject, styleObject);
                    DynamicPolygon.mergeProperties(geometryObject, styleObject);
                    DynamicPolyline.mergeProperties(geometryObject, styleObject);
                    DynamicObject.mergeProperties(geometryObject, styleObject);
                }
                geometryHandler(dataSource, geometryObject, kml, innerNode, dynamicObjectCollection);
                geometryObject = undefined;
            }
        }
    }

    //Object that holds all supported Geometry
    var geometryTypes = {
            Point : processPoint,
            LineString : processLineString,
            LinearRing : processLinearRing,
            Polygon: processPolygon,
            MultiGeometry: processMultiGeometry
            //TODO Model, gxTrack, gxMultitrack
    };

    function processStyle(styleNode, dynamicObject, sourceUri) {
        for(var i = 0, len = styleNode.childNodes.length; i < len; i++){
            var node = styleNode.childNodes.item(i);

            if(node.nodeName === "IconStyle"){
                //Map style to billboard properties
                //TODO heading, hotSpot
                var billboard = defined(dynamicObject.billboard) ? dynamicObject.billboard : new DynamicBillboard();
                var scale = getNumericValue(node, 'scale');
                var color = getColorValue(node, 'color');
                var icon = getStringValue(node,'href');
                if (defined(sourceUri)) {
                    var baseUri = new Uri(document.location.href);
                    sourceUri = new Uri(sourceUri);
                    icon = new Uri(icon).resolve(sourceUri.resolve(baseUri)).toString();
                }


                billboard.image = defined(icon) ? new ConstantProperty(icon) : undefined;
                billboard.scale = defined(scale) ? new ConstantProperty(scale) : undefined;
                billboard.color = defined(color) ? new ConstantProperty(color) : undefined;
                dynamicObject.billboard = billboard;
            }
            else if(node.nodeName ===  "LabelStyle")   {
                //Map style to label properties
                var label = defined(dynamicObject.label) ? dynamicObject.label : new DynamicLabel();
                var labelScale = getNumericValue(node, 'scale');
                var labelColor = getColorValue(node, 'color');

                label.scale = defined(labelScale) ? new ConstantProperty(labelScale) : undefined;
                label.fillColor = defined(labelColor) ? new ConstantProperty(labelColor) : undefined;
                label.text = defined(dynamicObject.name) ? new ConstantProperty(dynamicObject.name) : undefined;
                label.pixelOffset = new ConstantProperty(new Cartesian2(120, 1)); //arbitrary
                dynamicObject.label = label;
                //default billboard image
                if(!defined(dynamicObject.billboard)){
                    dynamicObject.billboard = new DynamicBillboard();
                    dynamicObject.billboard.image = new ConstantProperty("http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png");
                }
            }
            else if(node.nodeName ===  "LineStyle")   {
                //Map style to line properties
                //TODO PhysicalWidth, Visibility
                var polyline = defined(dynamicObject.polyline) ? dynamicObject.polyline : new DynamicPolyline();
                var lineColor = getColorValue(node, 'color');
                var lineWidth = getNumericValue(node,'width');
                var lineOuterColor = getColorValue(node,'outerColor');
                var lineOuterWidth = getNumericValue(node,'outerWidth');

                polyline.color = defined(lineColor) ? new ConstantProperty(lineColor) : undefined;
                polyline.width = defined(lineWidth) ? new ConstantProperty(lineWidth) : undefined;
                polyline.outlineColor = defined(lineOuterColor) ? new ConstantProperty(lineOuterColor) : undefined;
                polyline.outlineWidth = defined(lineOuterWidth) ? new ConstantProperty(lineOuterWidth) : undefined;
                dynamicObject.polyline = polyline;
            }
            else if(node.nodeName === "PolyStyle")   {
                //Map style to polygon properties
                //TODO Fill, Outline
                dynamicObject.polygon = defined(dynamicObject.polygon) ? dynamicObject.polygon : new DynamicPolygon();
                var polygonColor = getColorValue(node, 'color');
                dynamicObject.polygon.material = new DynamicMaterialProperty();
                dynamicObject.polygon.material.processCzmlIntervals({
                    solidColor : {
                        color : {
                            rgbaf : [polygonColor.red, polygonColor.green, polygonColor.blue, polygonColor.alpha]
                        }
                    }
                }, undefined, undefined);
            }
        }
    }

    //Processes and merges any inline styles for the provided node into the provided dynamic object.
    function processInlineStyles(dynamicObject, node, styleCollection, sourceUri) {
        //KML_TODO Validate the behavior for multiple/conflicting styles.
        var inlineStyles = node.getElementsByTagName('Style');
        var inlineStylesLength = inlineStyles.length;
        if (inlineStylesLength > 0) {
            //Google earth seems to always use the last inline style only.
            processStyle(inlineStyles.item(inlineStylesLength - 1), dynamicObject, sourceUri);
        }

        var externalStyles = node.getElementsByTagName('styleUrl');
        if (externalStyles.length > 0) {
            var styleObject = styleCollection.getObject(externalStyles.item(0).textContent);
            if (typeof styleObject !== 'undefined') {
                //Google earth seems to always use the first external style only.
                DynamicBillboard.mergeProperties(dynamicObject, styleObject);
                DynamicLabel.mergeProperties(dynamicObject, styleObject);
                DynamicPoint.mergeProperties(dynamicObject, styleObject);
                DynamicPolygon.mergeProperties(dynamicObject, styleObject);
                DynamicPolyline.mergeProperties(dynamicObject, styleObject);
                DynamicObject.mergeProperties(dynamicObject, styleObject);
            }
        }
    }

    //Asynchronously processes an external style file.
    function processExternalStyles(uri, styleCollection) {
        return when(loadXML(uri), function(styleKml) {
            return processStyles(styleKml, styleCollection, uri);
        });
    }

    //Processes all shared and external styles and stores
    //their id into the rovided styleCollection.
    //Returns an array of promises that will resolve when
    //each style is loaded.
    function processStyles(kml, styleCollection, sourceUri) {
        var i;

        var styleNodes = kml.getElementsByTagName('Style');
        var styleNodesLength = styleNodes.length;
        for (i = styleNodesLength - 1; i >= 0; i--) {
            var node = styleNodes.item(i);
            var attributes = node.attributes;
            var id = defined(attributes.id) ? attributes.id.textContent : undefined;
            if (defined(id)) {
                id = '#' + id;
                if (defined(sourceUri)) {
                    id = sourceUri + id;
                }
                if (!defined(styleCollection.getObject(id))) {
                    var styleObject = styleCollection.getOrCreateObject(id);
                    processStyle(node, styleObject, sourceUri);
                }
            }
        }

        var externalStyleHash = {};
        var promises = [];
        var styleUrlNodes = kml.getElementsByTagName('styleUrl');
        var styleUrlNodesLength = styleUrlNodes.length;
        for (i = 0; i < styleUrlNodesLength; i++) {
            var styleReference = styleUrlNodes[i].textContent;
            if (styleReference[0] !== '#') {
                var tokens = styleReference.split('#');
                if (tokens.length !== 2) {
                    throw new RuntimeError();
                }
                var uri = tokens[0];
                if (!defined(externalStyleHash[uri])) {
                    if (defined(sourceUri)) {
                        var baseUri = new Uri(document.location.href);
                        sourceUri = new Uri(sourceUri);
                        uri = new Uri(uri).resolve(sourceUri.resolve(baseUri)).toString();
                    }
                    promises.push(processExternalStyles(uri, styleCollection, sourceUri));
                }
            }
        }

        return promises;
    }

    function loadKML(dataSource, kml, sourceUri) {
        var dynamicObjectCollection = dataSource._dynamicObjectCollection;
        var styleCollection = new DynamicObjectCollection();

        //Since KML external styles can be asynchonous, we start off
        //my loading all styles first, before doing anything else.
        //The rest of the loading code is synchronous
        return when.all(processStyles(kml, styleCollection), function() {
            var array = kml.getElementsByTagName('Placemark');
            for ( var i = 0, len = array.length; i < len; i++) {
                var placemark = array[i];
                var placemarkId = defined(placemark.id) ? placemark.id : createGuid();
                var placemarkDynamicObject = dynamicObjectCollection.getOrCreateObject(placemarkId);
                processInlineStyles(placemarkDynamicObject, array[i], styleCollection);
                processPlacemark(dataSource, placemarkDynamicObject, placemark, dynamicObjectCollection, styleCollection);
            }
            dataSource._changed.raiseEvent(this);
        });
    }

    /**
     * A {@link DataSource} which processes KML.
     * @alias KmlDataSource
     * @constructor
     */
    var KmlDataSource = function() {
        this._changed = new Event();
        this._error = new Event();
        this._clock = undefined;
        this._dynamicObjectCollection = new DynamicObjectCollection();
        this._timeVarying = true;
    };

    /**
     * Gets an event that will be raised when non-time-varying data changes
     * or if the return value of getIsTimeVarying changes.
     * @memberof DataSource
     *
     * @returns {Event} The event.
     */
    KmlDataSource.prototype.getChangedEvent = function() {
        return this._changed;
    };

    /**
     * Gets an event that will be raised if an error is encountered during processing.
     * @memberof KmlDataSource
     *
     * @returns {Event} The event.
     */
    KmlDataSource.prototype.getErrorEvent = function() {
        return this._error;
    };

    /**
     * Gets the top level clock defined in KML or the availability of the
     * underlying data if no clock is defined.  If the KML document only contains
     * infinite data, undefined will be returned.
     * @memberof KmlDataSource
     *
     * @returns {DynamicClock} The clock associated with the current KML data, or undefined if none exists.
     */
    KmlDataSource.prototype.getClock = function() {
        return undefined;
    };

    /**
     * Gets the DynamicObjectCollection generated by this data source.
     * @memberof DataSource
     *
     * @returns {DynamicObjectCollection} The collection of objects generated by this data source.
     */
    KmlDataSource.prototype.getDynamicObjectCollection = function() {
        return this._dynamicObjectCollection;
    };

    /**
     * Gets a value indicating if the data varies with simulation time.  If the return value of
     * this function changes, the changed event will be raised.
     * @memberof DataSource
     *
     * @returns {Boolean} True if the data is varies with simulation time, false otherwise.
     */
    KmlDataSource.prototype.getIsTimeVarying = function() {
        return true;
    };

    /**
     * Replaces any existing data with the provided KML.
     *
     * @param {Object} KML The KML to be processed.
     * @param {String} source The source of the KML.
     *
     * @exception {DeveloperError} KML is required.
     */
    KmlDataSource.prototype.load = function(kml, source) {
        if (!defined(kml)) {
            throw new DeveloperError('kml is required.');
        }

        this._dynamicObjectCollection.clear();
        return loadKML(this, kml, source);
    };

    /**
     * Asynchronously loads the KML at the provided url, replacing any existing data.
     *
     * @param {Object} url The url to be processed.
     *
     * @returns {Promise} a promise that will resolve when the KML is processed.
     *
     * @exception {DeveloperError} url is required.
     */
    KmlDataSource.prototype.loadUrl = function(url) {
        if (!defined(url)) {
            throw new DeveloperError('url is required.');
        }

        var dataSource = this;
        return when(loadXML(url), function(kml) {
            return dataSource.load(kml, url);
        }, function(error) {
            dataSource._error.raiseEvent(dataSource, error);
            return when.reject(error);
        });
    };
    return KmlDataSource;
});