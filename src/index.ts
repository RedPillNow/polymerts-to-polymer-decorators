'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import {RedPill} from 'polymer-typescript-models';
import * as glob from 'glob';

let _options = null;

/**
 * Converts polymerTs files found in the pathGlob to use the polymer-decorators made available
 * in Polymer 2.4
 * @export
 * @param {any} pathGlob
 * @param {any} opts
 * @property {string} opts.outputPath The directory where all files will be dumped
 * @property {any} opts.glob Options for the glob module https://github.com/isaacs/node-glob#options
 */
export function convertToPolymerDecorators(pathGlob: string | string[], opts?: any) {
	let options = _setOptions(opts);
	_options = options;
	let procFiles = _getFileArray(pathGlob);
	let components = parseTs(procFiles);
	console.log('convertToPolymerDecorators, _components=', components);
}
/**
 * Setup the options object
 * @param {any} opts user provided options
 */
function _setOptions(opts): any {
	let defaultOpts = {
		outputPath: './polymerTsToPolymerDecoratorsOutput/',
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
 * @param {any} files array of file paths
 * @return {RedPill.Component[]}
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

// convertToPolymerDecorators('src/data/**/*.ts', {
// 	outputPath: './docs/',
// 	glob: {
// 		ignore: ['**/bower_components/**/*.*', 'src/data/app/dig/**/*.*']
// 	}
// });
convertToPolymerDecorators(['src/data/app/elements/dig-app-site/*.ts', 'src/data/app/elements/dig-app/*.ts'], {outputPath: './docs/'});
