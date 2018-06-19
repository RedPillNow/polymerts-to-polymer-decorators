import * as fs from 'fs';
import * as ts from 'typescript';
import transform from './utils/transform';
import * as glob from 'glob';
import * as rimraf from 'rimraf';
import * as chalk from './utils/chalkConfig';

let _options = null;
let _procFiles = [];

export default function updateSource(pathGlob: string | string[], options?: any) {
	console.log(chalk.success('Starting transformation of components...'));
	let opts = options ? _setOptions(options) : _options;
	_options = opts;
	if (_options.outputPath) {
		console.log(chalk.success('Output files will be placed in: ' + _options.outputPath));
		_updateOutputPath();
	}
	_procFiles = _getFileArray(pathGlob);
	const compilerHost = ts.createCompilerHost(_options.compiler);
	let allDiagnostics;
	let emittedFiles = [];
	for (let i = 0; i < _procFiles.length; i++) {
		let file = _procFiles[i];
		console.log(chalk.processing('Parsing File: ' + file + '...'));
		const program = ts.createProgram(_procFiles, _options.compiler, compilerHost);
		const msgs = {};
		let emitResult = program.emit(undefined, undefined, undefined, undefined, {before: [transform()]});
		emittedFiles.push(emitResult);
		allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
	}

	allDiagnostics.forEach(diagnostic => {
		let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
		let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
		console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`)
	});
	console.log('done compilng', JSON.stringify(emittedFiles));
}
function _getOutputFilePath(file: string) {

}
/**
 * Create the output path
 * @param pathGlob
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
function _setOptions(opts): any {
	let defaultOpts = {
		changeInline: false,
		outputPath: './polymerTsToPolymerDecoratorsOutput/',
		useMetadataReflection: false,
		conversionType: 'polymer-decorators',
		glob: {
			ignore: [
				'bower_components/**/*.*',
				'node_modules/**/*.*'
			]
		},
		compiler: {
			module: ts.ModuleKind.CommonJS,
			moduleResolution: ts.ModuleResolutionKind.NodeJs,
			noEmitOnError: false,
			noUnusedLocals: true,
			noUnusedParameters: true,
			stripInternal: true,
			target: ts.ScriptTarget.ES5,
			experimentalDecorators: true
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

// For dev purposes only. MUST be removed before deployment/release

// getComponents('src/data/**/*.ts', {
// 	outputPath: './docs/',
// 	glob: {
// 		ignore: ['**/bower_components/**/*.*', 'src/data/app/dig/**/*.*']
// 	}
// });
let files = [
	// 'src/data/app/elements/dig-app-site/*.ts',
	'src/data/app/elements/dig-app/*.ts',
	// 'src/data/app/elements/dig-animated-pages-behavior/*.ts'
];
// getComponents(files, {outputPath: './docs/'});
updateSource(files, {outputPath: './docs/'});

