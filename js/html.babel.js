const h = require('./h');
import Thenable   from './thenable';
import Tween      from './tween/tween';
import Deltas     from './delta/deltas';

// get tween properties
const obj = {};
Tween.prototype._declareDefaults.call( obj )
const keys = Object.keys( obj._defaults );
for (var i = 0; i < keys.length; i++) {
  obj._defaults[keys[i]] = 1;
}
obj._defaults['timeline'] = 1;
const TWEEN_PROPERTIES = obj._defaults;

/*
  TODO:
    - custom props
    - callback contexts for callbacks
    - current values in deltas
    - add isShowStart/isShowEnd options
*/

class Html extends Thenable {

  _declareDefaults () {
    this._defaults = {
      x:          0,
      y:          0,
      z:          0,

      skewX:      0,
      skewY:      0,

      rotate:     0,
      rotateX:    0,
      rotateY:    0,
      rotateZ:    0,

      scale:      1,
      scaleX:     1,
      scaleY:     1,
    }
    // exclude from automatic drawing
    this._drawExclude  = { el: 1 }
    // properties that cause 3d layer
    this._3dProperties = [ 'rotateX', 'rotateY', 'z' ];
    // properties that have array values
    this._arrayPropertyMap = { transformOrigin: 1, backgroundPosition: 1 }
    // properties that have no units
    this._numberPropertyMap = {
      opacity: 1, scale: 1, scaleX: 1, scaleY: 1,
      rotate: 1, rotateX: 1, rotateY: 1, rotateZ: 1,
      skewX: 1, skewY: 1
    }
    // properties that should be prefixed 
    this._prefixPropertyMap = { transform: 1, transformOrigin: 1 }
    // save prefix
    this._prefix = h.prefix.css;
  }

  then (o) {
    // return if nothing was passed
    if ((o == null) || !Object.keys(o).length) { return 1; }

    // get the last item in `then` chain
    var prevModule = h.getLastItem( this._modules );
    // set deltas to the finish state
    prevModule.deltas.refresh( false );
    // copy finish state to the last history record
    this._history[ this._history.length-1 ] = prevModule._props;
    // call super
    super.then(o);
    // restore the _props
    prevModule.deltas.restore();

    return this;
  }
  /*
    Method to pipe startValue of the delta.
    @private
    @ovarrides @ Thenable
    @param {String} Start property name.
    @param {Any} Start property value.
    @returns {Any} Start property value.
  */
  _checkStartValue (name, value) {
    if ( value == null ) {
      // return default value for transforms
      if ( this._defaults[name] != null ) { return this._defaults[name]; }
      // try to get the default DOM value
      if ( h.defaultStyles[name] != null ) { return h.defaultStyles[name]; }
      // at the end return 0
      return 0;
    }
    return value;
  }
  /*
    Method to draw _props to el.
    @private
  */
  _draw () {
    const p = this._props;
    for (var i = 0; i < this._drawProps.length; i++) {
      var name = this._drawProps[i];
      this._setStyle( name, p[name] );
    }
    // draw transforms
    this._drawTransform();
    // call custom transform callback if exist
    this._customDraw && this._customDraw( this._props.el, this._props );
  }
  /*
    Method to set transform on element.
    @private
  */
  _drawTransform () {
    const p = this._props;
    const string = ( !this._is3d )
      ? `translate(${p.x}, ${p.y})
          rotate(${p.rotateZ}deg)
          skew(${p.skewX}deg, ${p.skewY}deg)
          scale(${p.scaleX}, ${p.scaleY})`

      : `translate3d(${p.x}, ${p.y}, ${p.z})
          rotateX(${p.rotateX}deg)
          rotateY(${p.rotateY}deg)
          rotateZ(${p.rotateZ}deg)
          skew(${p.skewX}deg, ${p.skewY}deg)
          scale(${p.scaleX}, ${p.scaleY})`;

    this._setStyle( 'transform', string );
  }
  /*
    Method to render on initialization.
    @private
    @overrides @ Module
  */
  _render () {
    // return immediately if not the first in `then` chain
    if ( this._o.prevChainModule ) { return; }

    for (var i = 0; i < this._renderProps.length; i++) {
      var name  = this._renderProps[i],
          value = this._props[name];

      value = (typeof value === 'number') ? `${value}px` : value;
      this._setStyle( name, value );
    }

    this._draw();
  }
  /*
    Method to set style on el.
    @private
    @param {String} Style property name.
    @param {String} Style property value.
  */
  _setStyle ( name, value ) {
    if ( this._state[ name ] !== value ) {
      var style = this._props.el.style;
      // set style
      style[ name ] = value;
      // if prefix needed - set it
      if ( this._prefixPropertyMap[ name ] ) {
        style[ `${this._prefix}${name}` ] = value;
      }
      // cache the last set value
      this._state[ name ] = value;
    }
  }
  /*
    Method to copy `_o` options to `_props` object.
    @private
  */
  _extendDefaults () {
    this._props       = {};
    // props for intial render only
    this._renderProps = [];
    // props for draw on every frame update
    this._drawProps   = [];
    // save custom properties if present
    this._saveCustomProperties( this._o );
    // copy the options
    let o = { ...this._o };
    // extend options with defaults
    o = this._addDefaults(o);

    const keys = Object.keys( o );
    for ( var i = 0; i < keys.length; i ++ ) {
      var key = keys[i];
      // include the property if it is not in drawExclude object
      // and not in defaults = not a transform
      var isInclude =
        !this._drawExclude[key] && // not in exclude map
        this._defaults[key] == null && // not transform property
        !TWEEN_PROPERTIES[key]; // not tween property
      // copy all non-delta properties to the props
      // if not delta then add the property to render
      // list that is called on initialization
      // otherwise add it to the draw list that will
      // be drawed on each frame
      if ( !h.isDelta( o[key] ) && !TWEEN_PROPERTIES[key] ) {
        this._parseOption( key, o[key] );
        if ( key === 'el' ) { this._props[key] = h.parseEl( o[key] ); }
        if ( isInclude ) { this._renderProps.push( key ); }
      // copy delta prop but not transforms
      // otherwise push it to draw list that gets traversed on every draw
      } else if ( isInclude ) { this._drawProps.push( key ); }
    }

    this._createDeltas( o );
  }
  /*
    Method to save customProperties to _customProps.
    @param {Object} Options of the module.
  */
  _saveCustomProperties ( o ) {
    this._customProps = o.customProperties;
    
    if ( this._customProps ) {
      this._customDraw  = this._customProps.draw;

      delete this._customProps.draw;
      delete o.customProperties;
    }
  }
  /*
    Method to parse option value.
    @private
    @param {String} Option name.
    @param {Any} Option value.
  */
  _parseOption ( key, value ) {
    super._parseOption( key, value );
    // at this point the property is parsed
    var parsed = this._props[key];
    // cast it to string if it is array
    if ( h.isArray(parsed) ) {
      this._props[key] = this._arrToString(parsed);
    }
  }
  /*
    Method cast array to string value.
    @private
    @param {Array} Array of parsed numbers with units.
    @returns {String} Casted array.
  */
  _arrToString (arr) {
    var string = '';
    for (var i = 0; i < arr.length; i++) {
      string += `${arr[i].string} `;
    }
    return string;
  }
  /*
    Method to add defauls to passed object.
    @private
    @param {Object} Object to add defaults to.
  */
  _addDefaults (obj) {
    // flag that after all defaults are set will indicate
    // if user have set the 3d transform
    this._is3d = false;

    for (var key in this._defaults) {
      // skip property if it is listed in _skipProps
      // if (this._skipProps && this._skipProps[key]) { continue; }

      // copy the properties to the _o object
      // if it's null - set the default value
      if ( obj[key] == null ) {
        // scaleX and scaleY should fallback to scale
        if ( key === 'scaleX' || key === 'scaleY' ) {
          obj[key] = (obj['scale'] != null)
            ? obj['scale'] : this._defaults['scale'];
        } else { obj[key] = this._defaults[key]; }
      } else {
        // get if 3d property was set.
        if ( this._3dProperties.indexOf( key ) !== -1 ) { this._is3d = true }
      }
    }
    return obj;
  }
  /*
    Lifecycle method to declare variables.
    @private
  */
  _vars () {
    super._vars();
    // state of set properties
    this._state = {};
  }
  /*
    Method to create deltas from passed object.
    @private
    @param {Object} Options object to pass to the Deltas.
  */
  _createDeltas (options) {
    this.deltas = new Deltas({
      options,
      props:             this._props,
      onUpdate:          (p) => { this._draw(); },
      arrayPropertyMap:  this._arrayPropertyMap,
      numberPropertyMap: this._numberPropertyMap,
      customProps:       this._customProps,
      callbacksContext:  this,
      isChained:         !!this._o.prevChainModule
    });

    this.timeline = this.deltas.timeline;
  }
  /* @overrides @ Tweenable */
  _makeTween () {}
  _makeTimeline () {}

  /*
    Method to merge `start` and `end` for a property in then record.
    @private
    @param {String} Property name.
    @param {Any}    Start value of the property.
    @param {Any}    End value of the property.
  */
  // !! CCOOVVEERR !!
  // _mergeThenProperty ( key, startValue, endValue ) {
  //   // if isnt tween property
  //   var isBoolean = typeof endValue === 'boolean',
  //       curve, easing;
        
  //   if ( !h.isTweenProp(key) && !this._nonMergeProps[key] && !isBoolean ) {

  //     const TWEEN_PROPS = {};
  //     if ( h.isObject( endValue ) && endValue.to != null ) {
  //       for (let key in endValue ) {
  //         if ( TWEEN_PROPERTIES[key] || key === 'curve' ) {
  //           TWEEN_PROPS[key] = endValue[key];
  //           delete endValue[key];
  //         }
  //       }
  //       // curve    = endValue.curve;
  //       // easing   = endValue.easing;
  //       endValue = endValue.to;
  //     }

  //     // if end value is delta - just save it
  //     if ( this._isDelta(endValue) ) {

  //       const TWEEN_PROPS = {};
  //       for (let key in endValue ) {
  //         if ( TWEEN_PROPERTIES[key] || key === 'curve' ) {
  //           TWEEN_PROPS[key] = endValue[key];
  //           delete endValue[key];
  //         }
  //       }
  //       var result = this._parseDeltaValues(key, endValue);

  //       return { ...result, ...TWEEN_PROPS };
  //     } else {
  //       var parsedEndValue = this._parsePreArrayProperty(key, endValue);
  //       // if end value is not delta - merge with start value
  //       if ( this._isDelta(startValue) ) {
  //         // if start value is delta - take the end value
  //         // as start value of the new delta
  //         return {
  //           [ h.getDeltaEnd(startValue) ]: parsedEndValue, ...TWEEN_PROPS
  //         };
  //       // if both start and end value are not ∆ - make ∆
  //       } else { return { [ startValue ]: parsedEndValue, ...TWEEN_PROPS }; }
  //     }
  //   // copy the tween values unattended
  //   } else { return endValue; }
  // }
}

export default Html;

















/*
  Method to replace current values (=) in delta object.
  @private
  @param {String} Property name.
  @param {Object} Delta to replace in.
  @returns {Object} Delta with replaced values.
*/
// _replaceCurrent(name, delta) {
//   const computed = h.computedStyle( this._props.el ),
//         newDelta = {};

//   const keys = Object.keys(delta);
//   for (var i = 0; i < keys.length; i++) {
//     const key   = keys[i],
//           value = delta[key];

//     if ( key === '=' ) {
//       newDelta[computed[name]] = delta[key];
//     }
//   }

//   return newDelta;
// }



// /*
  //   Method to rename properties from camelCase to spinal-case.
  //   @private
  //   @param {Object} Options to rename.
  //   @returns {Object} Newely created object.
  // */
  // _renameProperties (opts) {
  //   const keys = Object.keys(opts);
  //   const newOpts = {};

  //   for (var i = 0; i < keys.length; i++ ) {
  //     var key = keys[i];
  //     // rename property only if it's not a tween property
  //     if ( !TWEEN_PROPERTIES[key] && ( this._defaults[key] == null ) ) {
  //       newOpts[ this._renameProperty(key) ] = opts[key];
  //     // otherwise just copy it
  //     } else { newOpts[ key ] = opts[key]; }
  //   }

  //   return newOpts;
  // }
  // /*
  //   Method to change string from camelCase to spinal-case.
  //   @private
  //   @param {String} String to change.
  //   @returns {String} Changed string.
  // */
  // _renameProperty (str) {
  //   return str.replace(/(?!^)([A-Z])/g, ' $1')
  //           .replace(/[_\s]+(?=[a-zA-Z])/g, '-').toLowerCase();
  // }