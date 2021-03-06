import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import {PolymerTsTransformerFactory} from './utils/transformer';
import * as glob from 'glob';
import * as rimraf from 'rimraf';
import * as chalk from './utils/chalkConfig';
import {ConverterOptions} from './utils/custom-types';

let _options: ConverterOptions = null;
let _procFiles: string[] = [];
let _generatedFiles: Map<ts.SourceFile, ts.SourceFile> = new Map();

/**
 * This will update the source files to Polymer 2.0
 * @param pathGlob - A glob of file paths
 * @param options - The options for transformation
 * @todo  we need to include Polymer 3.0
 */
export default function transformPolymerTs(pathGlob: string | string[], options?: any) {
	console.log(chalk.success('Starting transformation of components...'));
	const opts = options ? _setOptions(options) : _options;
	_options = opts;
	const compilerOpts = _options.compiler;
	let filesNotWritten = [];
	let filesWritten = [];
	if (_options.outputPath) {
		console.log(chalk.success('Output files will be placed in: ' + _options.outputPath));
		_updateOutputPath();
	}
	_procFiles = _getFileArray(pathGlob);
	const compilerHost = ts.createCompilerHost(compilerOpts);
	// generatedFiles is a map with the original source file as the key
	// and the new sourcefile as the value
	for (let i = 0; i < _procFiles.length; i++) {
		let file = _procFiles[i];
		console.log(chalk.processing('Parsing File: ' + file + '...'));
		const program: ts.Program = ts.createProgram([file], compilerOpts, compilerHost);
		const sourceFile: ts.SourceFile = program.getSourceFile(file);
		const transformerFactory = new PolymerTsTransformerFactory(sourceFile, _options, 2);
		const transformMethod = transformerFactory.transform;
		const result: ts.TransformationResult<ts.SourceFile> = ts.transform(sourceFile, [transformMethod.bind(transformerFactory)], compilerOpts);
		const newSourceFile: ts.SourceFile = result.transformed[0];
		_generatedFiles.set(sourceFile, newSourceFile);
		const printer: ts.Printer = ts.createPrinter({newLine: ts.NewLineKind.LineFeed});
		let outputText = null;
		try {
			outputText = printer.printFile(newSourceFile);
		}catch (e) {
			console.log(chalk.error(e));
		}
		if (outputText) {
			const notifications = transformerFactory.transformer.notifications;
			const transformChgMaps = transformerFactory.transformer.transformNodeMap;
			_writeSourceFile(file, outputText);
			console.log(chalk.success('*****File ' + file + ' successfully written*****\n'));
			filesWritten.push(file);
		}else {
			console.log(chalk.warning('*****File ' + file + ' NOT written due to errors!*****\n'));
			filesNotWritten.push(file);
		}
	}
	if (filesWritten.length > 0) {
		console.log(chalk.success('The following files were successfully written:\n' + filesWritten + '\n\n'));
	}
	if (filesNotWritten.length > 0) {
		console.log(chalk.warning('The following files were NOT written due to errors:\n' + filesNotWritten));
	}
}
/**
 * Write the transformed output to a new file
 * @param {string} file the full path to the current source file
 * @param {string} outputText the output text of the new file
 */
function _writeSourceFile(file: string, outputText: string) {
	let fileName = path.basename(file);
	let outputPath = path.join(_options.outputPath, fileName);
	let writeable = fs.createWriteStream(outputPath);
	writeable.write(outputText);
	writeable.end;
}
/**
 * Create the output path
 */
function _updateOutputPath() {
	if (!fs.existsSync(_options.outputPath)) {
		fs.mkdirSync(_options.outputPath.toString());
		console.log(chalk.success('Created output directory: ' + _options.outputPath));
	}else {
		console.log(chalk.warning('Will delete the contents of ' + _options.outputPath));
		rimraf.sync(_options.outputPath + '*');
		console.log(chalk.success('Content of ' + _options.outputPath + ' deleted!'));
	}
}
/**
 * Setup the options object
 * @param {any} opts user provided options
 */
function _setOptions(opts): ConverterOptions {
	let defaultOpts: ConverterOptions = {
		changeInline: false,
		outputPath: './polymerTsConvert/',
		useMetadataReflection: false,
		conversionType: 'polymer-decorators',
		targetPolymerVersion: 2,
		moveSinglePropertyObserversToProperty: true,
		applyDeclarativeEventListenersMixin: false,
		applyGestureEventListenersMixin: false,
		pathToBowerComponents: '../../bower_components/',
		changeComponentClassExtension: false,
		glob: {
			ignore: [
				'bower_components/**/*.*',
				'node_modules/**/*.*'
			]
		},
		compiler: {
			stripInternal: true,
			target: ts.ScriptTarget.ES5,
			experimentalDecorators: true,
			listEmittedFiles: true
		}
	};
	return Object.assign(defaultOpts, opts);
}
/**
 * Get an array of files from the glob passed in
 * @param {any} pathGlob a file path glob declaration
 * @returns {string[]}
 */
function _getFileArray(pathGlob) {
	let procFiles = [];
	if (!Array.isArray(pathGlob)) {
		pathGlob = [pathGlob];
	}
	for (let i = 0; i < pathGlob.length; i++) {
		let globPath = pathGlob[i];
		let globFiles = glob.sync(globPath, _options.glob);
		procFiles = procFiles.concat(globFiles)
	}
	return procFiles;
}

/**
 * For dev purposes only. MUST be removed before deployment/release
 * @ignore
 * @hidden
 */
let files = [
	// 'src/data/app/elements/dig-person-avatar/*.ts',
	// 'src/data/app/elements/dig-app-site/*.ts',
	'src/data/app/elements/dig-app/*.ts',
	// 'src/data/app/elements/dig-animated-pages-behavior/*.ts',
	// 'src/data/app/elements/**/*.ts',
	// 'src/data/app/elements/dig-card-drawer/dig-card-drawer.ts'
];
transformPolymerTs(files, {outputPath: './docs/'});

