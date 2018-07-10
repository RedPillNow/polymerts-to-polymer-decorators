# polymerts-to-polymer-decorators

This project is a tool to convert a [PolymerTS](https://github.com/nippur72/PolymerTS#observe) element into a [polymer-decorator](https://github.com/Polymer/polymer-decorators#observetargets-string) element.

**NOTE**: This project is still under active development and no where near ready for use.

## Installation

```cli
npm install --save-dev git+https://github.com/RedPillNow/polymerts-to-polymer-decorators.git
```

## Overview

This project is meant to convert a Polymer 1.x PolymerTS Element into an element which is using Polmymer 2.4 (or greater) polymer-decorators instead. This project came from the need to keep an enterprise's custom elements current with the most recent stable version of Polymer.

It was also decided that this tool should support more than just a conversion to polymer-decorators, but also provide documentation for a PolymerTS project via iron-component-page or convert to just plain-jane Polymer.

## Assumptions

We make a few assumptions while transforming PolymerTS files to use polymer-decorators. These are listed below:

* Declared Properties are defined before all other types of decorated items (i.e. `Observer`, `Listener`, `Computed`)
* If there is a `ready` function, it is defined **before** all `listener` decorated items

##  Current Limitations

**_This project is still in active development_**. As such there are certain limitations which will eventually be addressed:

* Computed Property:
	* If your computed property decorator has an object inside it and that object has a `value` key, it will not be removed and may not function properly
	* References to the arguments defined in the original PolymerTs method body are not updated with the `this` keyword
* Listener
	* If an element ID is not defined in the PolymerTs listener, we're currently adding `document` as the target. Should be `this`?
* Polymer 2.0 Deprecated methods and elements
	* We don't currently change these to the Polymer 2.0 supported pattern(s)

## Usage

### Simple Usage

```js
const toPolymerDecorators = require('polymerts-to-polymer-decorators');
toPolymerDecorators.convertToPolymerDecorators('src/**/*.ts', null);
```

### Usage with Options

```js
const toPolymerDecorators = require('polymerts-to-polymer-decorators');
let options = {
	changeInline: true,
	useMetadataReflection: true,
	glob: {
		ignore: [
			'test/**/*.*',
			'bower_components/**/*.*',
			'node_modules/**/*.*'
		]
	}
}
toPolymerDecorators.convertToPolymerDecorators('src/**/*.ts', options);
```

## Options

The following options are available to configure how to Transform your source files:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
|changeInline|boolean|false|Set to true to overwrite the original source file|
|outputPath|string|./polymerTsToPolymerDecoratorsOutput/|The path where you want the converted files placed|
|useMetadataReflection|boolean|false|Set to true to use the Metadata Reflection API|
|conversionType|string|polymer-decorators|Currently not used|
|targetPolymerVersion|number|2|The target version of Polymer to convert your source files to. Currently only version 2 is supported|
|moveSinglePropertyObserversToProperty|boolean|true|If an `@observe` tag is only watching 1 property add an `observe` property to the property it's observing and remove the `@observe` decorator if true|
|applyDeclarativeEventListenersMixin|boolean|true|If true will add the DeclarativeEventListenersMixin to the class|
|applyGestureEventListenersMixin|boolean|false|If true will add the GestureEventListenersMixin to the class|
|pathToBowerComponents|string|../../bower_components|Path to the bower_components directory|
|changeComponentClassExtension|boolean|false|If true and the component class doesn't extend `Polymer.Element` the extension class will be replaced with `Polymer.Element`|
|glob|object|{ignore:['bower_components/**/*.*','node_modules/**/*.*']|Files we should ignore|
|compiler|object|{stripInternal:true,target:ts.ScriptTarget.ES5,experimentalDecorators:true,listEmittedFiles:true}|TypeScript Compiler options|

## Contributing

Fork it and issue a Pull request
