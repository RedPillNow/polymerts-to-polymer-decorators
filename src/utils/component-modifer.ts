import * as fs from 'fs';
import * as Types from '../custom-types';
import {RegExModule} from '../regular-expressions';
import * as replace from 'replace-in-file';
import {RedPill} from 'polymerts-models';
import {Stream, TransformOptions} from 'stream';

export function modifyDecorators(component: RedPill.Component, type: Types.PolymerDecorators) {
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
}

function _modifyComputedProperty(computedProp: RedPill.ComputedProperty) {
	if (computedProp) {
		let readStream = fs.createReadStream(computedProp.filePath);
		let transformStream = new TransformComputedProperty({objectMode: true});
		transformStream.startLine = computedProp.startLineNum;
		transformStream.endLine = computedProp.endLineNum;

		readStream.pipe(transformStream)
		let lineCount = 1;
		transformStream.on('readable', () => {
			let line = null;
			while (null !== (line = transformStream.read())) {
				console.log('line #' + lineCount + ': ' + line);
			}
			lineCount++;
		});
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

	constructor(opts: TransformOptions) {
		super(opts);
	}

	_transform(chunk: any, enc?: string, done?: Function) {
		let data = chunk.toString();
		if (this._lastLineData) {
			data = this._lastLineData + data;
		}
		let lines = data.split('\n');
		let concernedLines = lines.slice(this.startLine -1, this.endLine -1);

		// Prevent lines being broken in the middle of the line
		this._lastLineData = concernedLines.splice(concernedLines.length -1, 1)[0];
		concernedLines.forEach((line, idx) => {
			let newLine = line;
			// Send line to stream
			this.push(newLine);
		});
		done();
	}

	_flush(done: Function) {
		if (this._lastLineData) {
			this.push(this._lastLineData);
		}
		this._lastLineData = null;
		done();
	}

}
