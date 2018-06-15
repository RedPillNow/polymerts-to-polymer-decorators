'use strict';

import * as fs from 'fs';
import * as ts from 'typescript';
import {RedPill} from 'polymerts-models';
import * as glob from 'glob';
import * as modifier from './utils/component-modifer';
import * as Types from './custom-types';

let _options = null;
let _procFiles: any[] = [];

/**
 * Converts polymerTs decorators found in the pathGlob to use the polymer-decorators made available
 * in Polymer 2.4
 * @export
 * @param {any} pathGlob
 * @param {any} opts
 * @property {string} opts.outputPath The directory where all files will be dumped
 * @property {any} opts.glob Options for the glob module https://github.com/isaacs/node-glob#options
 */
export function updateDecorators(pathGlob: string | string[], opts?: any) {
	let options = opts ? _setOptions(opts) : _options;
	_options = options;
	_procFiles = pathGlob ? _getFileArray(pathGlob) : _procFiles;
	let components = parseTs(_procFiles);
	for (let i = 0; i < components.length; i++) {
		let component: RedPill.Component = components[i];
		// _modifyDecorators(component, Types.PolymerDecorators.CUSTOMELEMENT);
		modifier.modifyDecorators(component, Types.PolymerDecorators.COMPUTED, _options);
	}
}


/**
 * Get an array of RedPill.Component objects from the pathGlob
 * @export
 * @param {any} pathGlob
 * @param {any} opts
 * @property {string} opts.outputPath The directory where all files will be dumped
 * @property {any} opts.glob Options for the glob module https://github.com/isaacs/node-glob#options
 * @returns {RedPill.Component[]}
 */
export function getComponents(pathGlob: string | string[], opts?: any) {
	let options = opts ? _setOptions(opts) : _options;
	_options = options;
	_procFiles = pathGlob ? _getFileArray(pathGlob) : _procFiles;
	let components = parseTs(_procFiles);
	return components;
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
				'node_components/**/*.*'
			]
		}
	};
	return Object.assign(defaultOpts, opts);
}
/**
 * Start parsing the Typescript files passed along in files
 * @param {any} files - array of file paths
 * @returns {RedPill.Component[]}
 */
export function parseTs(files): RedPill.Component[] {
	if (!files) {
		throw new Error('No Files Defined!');
	}
	let components: RedPill.Component[] = [];
	for (let i = 0; i < files.length; i++) {
		let file = files[i];
		let component: RedPill.Component = null;
		let sourceFile = ts.createSourceFile(file, fs.readFileSync(file).toString(), ts.ScriptTarget.ES2015, true);
		let namespace = null;
		let parseNode = (node: ts.Node) => {
			switch (node.kind) {
				case ts.SyntaxKind.ClassDeclaration:
					if (node.decorators && node.decorators.length > 0) {
						component = new RedPill.Component(<ts.ClassDeclaration>node);
						component.namespace = namespace;
						component.comment ? component.comment.isFor = RedPill.ProgramType.Component : null;
						component.useMetadataReflection = _options.useMetadataReflection;
						components.push(component);
					}
					break;
				case ts.SyntaxKind.ModuleDeclaration: // namespace declaration
					let module: ts.ModuleDeclaration = <ts.ModuleDeclaration>node;
					namespace = module.name.getText();
					break;
			};
			ts.forEachChild(node, parseNode);
		};
		parseNode(sourceFile);
	}
	return components;
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
updateDecorators(files, {outputPath: './docs/'});
