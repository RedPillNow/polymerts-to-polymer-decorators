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
 * @property {any} opts.glob Options for the glob module https://github.com/isaacs/node-glob#options
 */
export function convertToPolymerDecorators(pathGlob, opts) {
	_setOptions(opts);
	let procFiles = _getFileArray(pathGlob);
	_parseTs(procFiles);
	console.log('convertToPolymerDecorators, _components=', _components);
}
/**
 * Setup the options object
 * @param {any} opts
 */
function _setOptions(opts): void {
	let defaultOpts = {
		outputPath: './polymerTsToPolymerDecoratorsOutput/',
		glob: {
			ignore: [
				'bower_components/**/*.*',
				'node_components/**/*.*'
			]
		}
	};
	_options = opts || defaultOpts;
	_options.glob = opts.glob || defaultOpts.glob;
}
/**
 * Start parsing the Typescript files passed along in files
 * @param {any} files array of file paths
 */
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
					let prop: ts.PropertyDeclaration = <ts.PropertyDeclaration>node;
					if (prop && prop.decorators && prop.decorators.length > 0 && !component) {
						console.log('Seems we encountered a property with no component', prop.name.getText());
						break;
					}else if (component) {
						component = Object.assign(component, _initProperty(component, node));
					}
					break;
				case ts.SyntaxKind.MethodDeclaration:
					// console.log('_parseTs, Method declaration', node);
					let method: ts.MethodDeclaration = <ts.MethodDeclaration>node;
					if (!component) {
						console.log('Seems we encountered a property with no component', method.name.getText());
						break;
					}
					component = Object.assign(component, _initMethod(component, node));
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
/**
 * Populate the component with the values from the node
 * @param {ts.Node} node
 * @returns {RedPill.Component}
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
 * Build a property and push to the _properties array
 * @param {RedPill.Component} component
 * @param {ts.Node} node
 * @returns {RedPill.Component}
 */
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
 * @param {RedPill.Component} component
 * @param {ts.Node} node
 * @returns {RedPill.Component}
 */
function _initMethod(component: RedPill.Component, node: ts.Node): RedPill.Component {
	if (node && node.kind === ts.SyntaxKind.MethodDeclaration) {
		let _functions = component.methods || [];
		let _properties = component.properties || [];
		let _listeners = component.listeners || [];
		let _observers = component.observers || [];
		let method: ts.MethodDeclaration = <ts.MethodDeclaration>node;
		// console.log('_getMethod for', method.name.getText(), ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart()));
		if (RedPill.isComputedProperty(method)) {
			let computed: RedPill.ComputedProperty = _initComputedProperty(method);
			if (computed) {
				let computedMethod = RedPill.getMethodFromComputed(computed);
				_functions.push(computedMethod);
				_properties.push(computed);
			}
		} else if (RedPill.isListener(method)) {
			let listener: RedPill.Listener = _initListener(method);
			if (listener) {
				if (listener.methodName) {
					let listenerMethod = RedPill.getMethodFromListener(listener);
					_functions.push(listenerMethod);
				}
				_listeners.push(listener);
			}
		} else if (RedPill.isObserver(method)) {
			let observer: RedPill.Observer = _initObserver(method);
			if (observer) {
				let observerMethod = RedPill.getMethodFromObserver(observer);
				_functions.push(observerMethod);
				if ((observer.properties && observer.properties.length === 1) && observer.properties[0].indexOf('.') === -1) {
					let property: RedPill.Property = findProperty(component, observer.properties[0]);
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
			let func: RedPill.Function = _initFunction(method);
			if (func) {
				_functions.push(func);
			}
		}
		component.listeners = _listeners;
		component.properties = _properties;
		component.observers = _observers;
		component.methods = _functions;
	}
	return component;
}
/**
 * Get a computed property if the node is a ComputedProperty
 * @param {ts.MethodDeclaration} node
 * @returns {RedPill.ComputedProperty}
 * @todo Need to create the function
 */
function _initComputedProperty(node: ts.MethodDeclaration): RedPill.ComputedProperty {
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
 * Get a function if the node is a MethodDeclaration and is not a
 * computed property, observer, listener, etc. Also, it's parent must be
 * the "component's" node
 * @param {ts.MethodDeclaration} node
 * @returns {RedPill.Function}
 */
function _initFunction(node: ts.MethodDeclaration): RedPill.Function {
	if (node) {
		let func: RedPill.Function = new RedPill.Function();
		func.tsNode = node;
		func.methodName = node.name.getText();;
		func.startLineNum = RedPill.getStartLineNumber(node);
		func.endLineNum = RedPill.getEndLineNumber(node);
		let params = [];
		let parseChildren = (childNode: ts.Node) => {
			// console.log('_getFunction.parseChildren.childNode.kind=', (<any>ts).SyntaxKind[childNode.kind], '=', childNode.kind)
			if (childNode.kind === ts.SyntaxKind.Parameter && childNode.parent === node) {
				let param = <ts.ParameterDeclaration>childNode;
				params.push(childNode.getText().replace(/\??:\s*[a-zA-Z]*/g, ''));
			}
			ts.forEachChild(childNode, parseChildren);
		}
		parseChildren(node);
		func.comment ? func.comment.isFor = RedPill.ProgramType.Function : null;
		func.parameters = params;
		return func;
	}
	return null;
}
/**
 * Get a Listener if the node is a listener
 *
 * @param {ts.MethodDeclaration} node
 * @returns {RedPill.Listener}
 */
function _initListener(node: ts.MethodDeclaration): RedPill.Listener {
	if (node) {
		let listener: RedPill.Listener = new RedPill.Listener();
		listener.tsNode = node;
		listener.methodName = node.name.getText();
		listener.startLineNum = RedPill.getStartLineNumber(node);
		listener.endLineNum = RedPill.getEndLineNumber(node);
		listener.comment ? listener.comment.isFor = RedPill.ProgramType.Listener : null;
		if (node.decorators && node.decorators.length > 0) {
			node.decorators.forEach((decorator: ts.Decorator, idx) => {
				let parseChildren = (decoratorChildNode) => {
					let kindStr = (<any>ts).SyntaxKind[decoratorChildNode.kind] + '=' + decoratorChildNode.kind;
					switch (decoratorChildNode.kind) {
						case ts.SyntaxKind.StringLiteral:
							let listenerStrNode = <ts.StringLiteral>decoratorChildNode;
							listener.eventDeclaration = listenerStrNode.getText();
							break;
						case ts.SyntaxKind.PropertyAccessExpression:
							let listenerPropAccExp = <ts.PropertyAccessExpression>decoratorChildNode;
							listener.eventDeclaration = listenerPropAccExp.getText();
							listener.isExpression = true;
							break;
					};
					ts.forEachChild(decoratorChildNode, parseChildren);
				};
				parseChildren(decorator);
			});
		}
		let sigArr: string[] = listener.eventDeclaration ? listener.eventDeclaration.split('.') : [];
		listener.eventName = sigArr[1] || null;
		listener.elementId = listener.eventName ? sigArr[0] : null;
		return listener;
	}
	return null;
}
/**
 * Get an observer object if the node is an Observer
 * @param {ts.MethodDeclaration} node
 * @returns {RedPill.Observer}
 */
function _initObserver(node: ts.MethodDeclaration): RedPill.Observer {
	if (node) {
		let observer: RedPill.Observer = new RedPill.Observer();
		observer.tsNode = node;
		observer.startLineNum = RedPill.getStartLineNumber(node);
		observer.endLineNum = RedPill.getEndLineNumber(node);
		observer.methodName = node.name.getText();
		observer.comment ? observer.comment.isFor = RedPill.ProgramType.Observer : null;
		if (node.decorators && node.decorators.length > 0) {
			node.decorators.forEach((decorator: ts.Decorator, idx) => {
				let parseChildren = (decoratorChildNode: ts.Node) => {
					if (decoratorChildNode.kind === ts.SyntaxKind.StringLiteral) {
						let observerStrNode = <ts.StringLiteral>decoratorChildNode;
						let propsStr = observerStrNode.getText();
						propsStr = propsStr.replace(/[\s']*/g, '');
						observer.properties = propsStr.split(',');
					}
					ts.forEachChild(decoratorChildNode, parseChildren);
				};
				parseChildren(decorator);
			});
		}
		return observer;
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
/**
 * Find a property in the _properties array by it's name
 * @param {RedPill.Component} component
 * @param {string} propertyName
 * @returns {Property}
 */
function findProperty(component: RedPill.Component, propertyName: string): RedPill.Property {
	let prop = null;
	let _properties = component.properties;
	if (_properties && _properties.length > 0) {
		prop = _properties.find((prop: RedPill.Property, idx) => {
			return prop.name === propertyName;
		});
	}
	return prop;
}

// For dev purposes only. MUST be removed before deployment/release
convertToPolymerDecorators('src/data/**/*.ts', {
	outputPath: './docs/',
	glob: {
		ignore: ['**/bower_components/**/*.*', 'src/data/app/dig/**/*.*']
	}
});
// convertToPolymerDecorators(['src/data/app/elements/dig-app/*.ts', 'src/data/app/elements/dig-app-site/*.ts'], {outputPath: './docs/'});
