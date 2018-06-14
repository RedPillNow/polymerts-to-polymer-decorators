# polymerts-to-polymer-decorators

This project is a tool to convert a [PolymerTS](https://github.com/nippur72/PolymerTS#observe) element into a [polymer-decorator](https://github.com/Polymer/polymer-decorators#observetargets-string) element.

## Installation

```cli
npm install --save-dev git+https://github.com/RedPillNow/polymerts-to-polymer-decorators.git
```

## Overview

This project is meant to convert a Polymer 1.x PolymerTS Element into an element which is using Polmymer 2.4 (or greater) polymer-decorators instead. This project came from the need to keep an enterprise's custom elements current with the most recent stable version of Polymer.

It was also decided that this tool should support more than just a conversion to polymer-decorators, but also provide documentation for a PolymerTS project via iron-component-page or convert to just plain-jane Polymer.

## Usage

### Simple Usage

```js
const toPolymerDecorators = require('polymerts-to-polymer-decorators');
let options = null;
toPolymerDecorators.convertToPolymerDecorators('src/**/*.ts', options);
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
			'node_modules/**/*.*
		]
	};
toPolymerDecorators.convertToPolymerDecorators('src/**/*.ts', options);
```

## Options

## Contributing

Fork it and issue a Pull request
