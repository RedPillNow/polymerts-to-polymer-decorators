import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
// import * as Types from '../custom-types';
// import {RegExModule} from '../regular-expressions';
// import * as replace from 'replace-in-file';
import {RedPill} from 'polymerts-models';
import {Stream, TransformOptions} from 'stream';

let _options = null;

export function transformSource(component: RedPill.Component, options) {
	if (component && options) {
		_options = options;

	}
}

/* export function modifyDecorators(component: RedPill.Component, type: Types.PolymerDecorators, options) {
	_options = options;
	if (component && type) {
		let replaceOpts: any = {
			files: component.filePath,
			from: null,
			to: null
		};
		switch (type) {
			case Types.PolymerDecorators.CUSTOMELEMENT:
				replaceOpts.from = RegExModule.polymerTSRegEx.component;
				replaceOpts.to = '@customElement(\'' + component.name + '\')';
				return replace.sync(replaceOpts);
			case Types.PolymerDecorators.COMPUTED:
				for (let i = 0; i < component.computedProperties.length; i++) {
					let computed: RedPill.ComputedProperty = component.computedProperties[i];
					_modifyComputedProperty(computed);
				}
				break;
			case Types.PolymerDecorators.LISTEN:
				break;
			case Types.PolymerDecorators.OBSERVE:
				break;
		};
	}
	return null;
} */

function _modifyComputedProperty(computedProp: RedPill.ComputedProperty) {
	if (computedProp) {
		let writePath = computedProp.filePath;
		let readPath = computedProp.filePath;
		if (_options && _options.outputPath) {
			writePath = path.join(_options.outputPath,computedProp.fileName);
		}
		if (!fs.existsSync(writePath)) {
			fs.closeSync(fs.openSync(writePath, 'w'));
		}else {
			readPath = path.join(_options.outputPath, computedProp.fileName);
		}
		let transformStream = new TransformComputedProperty({objectMode: true});
		transformStream.startLine = computedProp.startLineNum;
		transformStream.endLine = computedProp.endLineNum;
		transformStream.computedProp = computedProp;
		let writeStream = fs.createWriteStream(writePath);
		let readStream = fs.createReadStream(readPath)
			.pipe(transformStream)
			.pipe(writeStream);

	}
}

class BaseTransform extends Stream.Transform {

	constructor(opts: TransformOptions) {
		super(opts);
	}

	_transform(chunk: any, enc?: string, done?: Function) {
		this.push(chunk);
	}
}

class TransformComputedProperty extends BaseTransform {
	private _lastLineData: any;
	startLine: number;
	endLine: number;
	computedProp: RedPill.ComputedProperty;

	constructor(opts: TransformOptions) {
		super(opts);
	}

	_transform(chunk: any, enc?: string, done?: Function) {
		let data = chunk.toString();
		if (this._lastLineData) {
			data = this._lastLineData + data;
		}
		// Entire file by line
		let lines = data.split('\n');
		// Replacement Text for Computed Property
		/* let replacementTextArr = this.computedProp.polymerDecoratorSignature.split('\n');
		lines.forEach((line, idx) => {
			if (idx === this.startLine -1) {
				// Remove old, add new
				let removeLineCount = (this.endLine - this.startLine) + 1;
				let removedItems = lines.splice(idx, removeLineCount);
				console.log('removed: ', JSON.stringify(removedItems));
				// Array.prototype.splice.apply(lines, [idx, 0].concat(replacementTextArr));
				lines.splice(idx, 0, ...replacementTextArr);
				console.log('added: ', JSON.stringify(replacementTextArr));
			}
		}); */
		let newText = lines.join('\n');
		this.push(newText);
		done();
	}

	_flush(done: Function) {
		if (this._lastLineData) {
			// this.push(this._lastLineData);
		}
		this._lastLineData = null;
		done();
	}

}
