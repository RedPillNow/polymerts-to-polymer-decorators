import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import {RedPill} from 'polymer-typescript-models';
import * as glob from 'glob';

declare type PathInfo = {
	fileName?: string,
	dirName?: string,
	docFileName?: string,
	htmlFileName?: string,
	fullDocFilePath?: string,
	fullHtmlFilePath?: string
};

// let Utils = Utils;
let _components: RedPill.Component[] = [];
let _options = null;

/**
 * Converts polymerTs files found in the pathGlob to use the polymer-decorators made available
 * in Polymer 2.4
 * @export
 * @param {any} pathGlob
 * @param {any} opts
 * @property {string} opts.outputPath
 * @property {any} opts.glob Options for the glob module
 */
export function convertToPolymerDecorators(pathGlob, opts) {
	let defaultOpts = {
		outputPath: './polymerTsToPolymerDecoratorsOutput/',
		glob: {
			ignore: '**/bower_components/**/*.*'
		}
	};
	_options = opts || defaultOpts;
	_options.glob = opts.glob || defaultOpts.glob;

	let procFiles = _getFileArray(pathGlob);
	_parseTs(procFiles);
	console.log('convertToPolymerDecorators, _components=', _components);
}

function _parseTs(files): void {
	if (!files) {
		throw new Error('No Files Defined!');
	}
	for (let i = 0; i < files.length; i++) {
		let file = files[i];
		let component: RedPill.Component = null;
		let sourceFile = ts.createSourceFile(file, fs.readFileSync(file).toString(), ts.ScriptTarget.ES2015, true);
		let namespace = null;
		let parseNode = (node: ts.Node) => {
			// console.log('_parseTs.parseNode, node.kind=', (<any>ts).SyntaxKind[node.kind]);
			switch (node.kind) {
				case ts.SyntaxKind.ClassDeclaration:
					if (node.decorators && node.decorators.length > 0) {
						component = _initComponent(node);
						component.namespace = namespace;
						component.filePath = file;
						_components.push(component);
					}
					break;
				case ts.SyntaxKind.PropertyDeclaration:
					// console.log('_parseTs, Property declaration', node);
					if (!component) {
						console.log('Seems we encountered a property with no component');
						break;
					}
					component = Object.assign(component, _initProperty(component, node));
					break;
				case ts.SyntaxKind.MethodDeclaration:
					// console.log('_parseTs, Method declaration', node);
					if (!component) {
						console.log('Seems we encountered a property with no component');
						break;
					}
					// component = Object.assign(component, _initMethod(component, node));
					break;
				case ts.SyntaxKind.ModuleDeclaration: // namespace declaration
					// console.log('_parseTs, Module declaration', node);
					let module: ts.ModuleDeclaration = <ts.ModuleDeclaration>node;
					namespace = module.name.getText();
					break;
			};
			ts.forEachChild(node, parseNode);
		};
		parseNode(sourceFile);
	}
}

/**
 * Populate the component with the values from the node
 * @param {ts.Node} node
 * @returns {Component}
 */
function _initComponent(node: ts.Node): RedPill.Component {
	let component: RedPill.Component = new RedPill.Component();
	if (node && node.decorators && node.decorators.length > 0) {
		let clazz: ts.ClassDeclaration = <ts.ClassDeclaration>node;
		component.tsNode = node;
		component.className = clazz.name.getText();
		// component.startLineNum = RedPill.getStartLineNumber(node);
		// component.endLineNum = RedPill.getEndLineNumber(node);
		component.comment ? component.comment.isFor = RedPill.ProgramType.Component : null;
		component = Object.assign(component, _processComponentDecorators(component, node));
	}
	return component;
}
/**
 * Process a component's decorators. These should only be behaviors, at least that's all
 * we care about at the moment
 * @param {RedPill.Component} component
 * @param {ts.Node} node
 * @returns {RedPill.Component}
 */
function _processComponentDecorators(component: RedPill.Component, node: ts.Node): RedPill.Component {
	if (node && node.decorators && node.decorators.length > 0) {
		let behaviors = [];
		node.decorators.forEach((decorator: ts.Decorator) => {
			// console.log('decorator', decorator);
			let exp: ts.Expression = decorator.expression;
			let expText = exp.getText();
			let componentMatch = /\s*(?:component)\s*\((?:['"]{1}(.*)['"]{1})\)/.exec(exp.getText());
			let behaviorMatch = /\s*(?:behavior)\s*\((...*)\)/.exec(exp.getText());
			if (componentMatch && componentMatch.length > 0) {
				component.name = componentMatch[1];
			} else if (behaviorMatch && behaviorMatch.length > 0) {
				if (!component.behaviors || !Array.isArray(component.behaviors)) {
					component.behaviors = [];
				}
				let behave: RedPill.Behavior = new RedPill.Behavior();
				behave.tsNode = decorator;
				// behave.startLineNum = RedPill.getStartLineNumber(decorator);
				// behave.endLineNum = RedPill.getEndLineNumber(decorator);
				behave.name = behaviorMatch[1];
				behaviors.push(behave);
			}
		});
		component.behaviors = behaviors;
	}
	return component;
}

function _initProperty(component: RedPill.Component, node: ts.Node): RedPill.Component {
	if (node && node.kind === ts.SyntaxKind.PropertyDeclaration) {
		let prop = null;
		let tsProp = <ts.PropertyDeclaration>node;
		let isInComponent = RedPill.isNodeComponentChild(tsProp.parent, component);
		let insideProperty = false;
		if (isInComponent && tsProp.decorators && tsProp.decorators.length > 0) {
			prop = new RedPill.Property();
			prop.tsNode = node;
			prop.startLineNum = RedPill.getStartLineNumber(node);
			prop.endLineNum = RedPill.getEndLineNumber(node);
			prop.name = tsProp.name.getText();
			prop.comment ? prop.comment.isFor = RedPill.ProgramType.Property : null;
			let parseChildren = (childNode: ts.Node) => {
				if (childNode.kind === ts.SyntaxKind.ObjectLiteralExpression) {
					let objExp = <ts.ObjectLiteralExpression>childNode;
					if (!insideProperty) {
						let objLiteralObj = RedPill.getObjectLiteralString(objExp);
						prop.params = objLiteralObj.str;
						prop.type = objLiteralObj.type;
						insideProperty = true;
					} else {
						prop.containsValueObjectDeclaration = true;
						prop.valueObjectParams = RedPill.getObjectLiteralString(objExp).str;
					}
				} else if (childNode.kind === ts.SyntaxKind.ArrowFunction) {
					prop.containsValueFunction = true;
				} else if (childNode.kind === ts.SyntaxKind.FunctionExpression) {
					prop.containsValueFunction = true;
				} else if (childNode.kind === ts.SyntaxKind.ArrayLiteralExpression) {
					let arrayLiteral = <ts.ArrayLiteralExpression>childNode;
					prop.containsValueArrayLiteral = true;
					prop.valueArrayParams = arrayLiteral.getText();
				}
				ts.forEachChild(childNode, parseChildren);
			}
			parseChildren(tsProp);
			let props = component.properties;
			props.push(prop);
			component.properties = props;
		}
	}
	return component;
}
/**
 * Build a function and add to the component. However, if our function
 * is an observer, computed property, listener, etc. Build the proper object
 * and push it to the proper array
 * @param {ts.Node} node
 */
/* function _initMethod(component: RedPill.Component, node: ts.Node): RedPill.Component {
	if (node && node.kind === ts.SyntaxKind.MethodDeclaration) {
		let method: ts.MethodDeclaration = <ts.MethodDeclaration>node;
		// console.log('_getMethod for', method.name.getText(), ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart()));
		if (RedPill.isComputedProperty(method)) {
			let computed: RedPill.ComputedProperty = _getComputedProperty(method);
			if (computed) {
				let computedMethod = RedPill.getMethodFromComputed(computed);
				_functions.push(computedMethod);
				_properties.push(computed);
			}
		} else if (RedPill.isListener(method)) {
			let listener: Listener = _getListener(method);
			if (listener) {
				if (listener.methodName) {
					let listenerMethod = RedPill.getMethodFromListener(listener);
					_functions.push(listenerMethod);
				}
				_listeners.push(listener);
			}
		} else if (RedPill.isObserver(method)) {
			let observer: Observer = _getObserver(method);
			if (observer) {
				let observerMethod = RedPill.getMethodFromObserver(observer);
				_functions.push(observerMethod);
				if ((observer.properties && observer.properties.length === 1) && observer.properties[0].indexOf('.') === -1) {
					let property: Property = findProperty(observer.properties[0]);
					try {
						let propertyParamObj = RedPill.getObjectFromString(property.params);
						propertyParamObj.observer = observer.methodName;
						property.params = RedPill.getStringFromObject(propertyParamObj);
					} catch (e) {
						throw new Error('Property: \'' + observer.properties[0] + '\' for observer method \'' + observerMethod.methodName + '\' is not defined as a property on the component');
					}
				} else {
					_observers.push(observer);
				}
			}
		} else {
			let func: Function = _getFunction(method);
			if (func) {
				_functions.push(func);
			}
		}
	}
} */
/**
 * Get a computed property if the node is a ComputedProperty
 * @param {ts.MethodDeclaration} node
 * @returns {ComputedProperty}
 * @todo Need to create the function
 */
function _getComputedProperty(node: ts.MethodDeclaration): RedPill.ComputedProperty {
	if (node) {
		let computed: RedPill.ComputedProperty = new RedPill.ComputedProperty();
		computed.tsNode = node;
		computed.name = node.name.getText();
		computed.methodName = '_get' + RedPill.capitalizeFirstLetter(node.name.getText().replace(/_/g, ''));
		computed.startLineNum = RedPill.getStartLineNumber(node);
		computed.endLineNum = RedPill.getEndLineNumber(node);
		computed.comment ? computed.comment.isFor = RedPill.ProgramType.Computed : null;
		let parseChildren = (childNode: ts.Node) => {
			if (childNode.kind === ts.SyntaxKind.ObjectLiteralExpression) {
				let objExp = <ts.ObjectLiteralExpression>childNode;
				let objLitObj = RedPill.getObjectLiteralString(objExp);
				computed.params = objLitObj.str;
				computed.type = objLitObj.type;
			}
			ts.forEachChild(childNode, parseChildren);
		};
		parseChildren(node);
		return computed;
	}
	return null;
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
 * Get the pieces of the path for fileName
 * @param {string} fileName
 * @returns {any} pathInfo
 * @property {string} pathInfo.fileName - The original source file name
 * @property {string} pathInfo.dirName - The directory name for fileName
 * @property {string} pathInfo.docFileName - The generated documentation file name
 * @property {string} pathInfo.fullDocFilePath - The full path to pathInfo.docFileName
 */
function _getPathInfo(fileName: string, docPath: string): PathInfo {
	let pathInfo: PathInfo = {};
	if (fileName) {
		let fileNameExt = path.extname(fileName);
		pathInfo.fileName = fileName;
		pathInfo.dirName = docPath;
		pathInfo.docFileName = 'doc_' + path.basename(fileName).replace(fileNameExt, '.html');
		pathInfo.fullDocFilePath = path.join(docPath, pathInfo.docFileName);
		pathInfo.htmlFileName = path.basename(fileName).replace(fileNameExt, '.html');
		pathInfo.fullHtmlFilePath = path.join(path.dirname(fileName), pathInfo.htmlFileName);
	}
	return pathInfo;
}

// For dev purposes only. MUST be removed before deployment/release
convertToPolymerDecorators('src/data/**/*.ts', {outputPath: './docs/'});
// convertToPolymerDecorators(['src/data/app/elements/dig-app/*.ts', 'src/data/app/elements/dig-app-site/*.ts'], {outputPath: './docs/'});
