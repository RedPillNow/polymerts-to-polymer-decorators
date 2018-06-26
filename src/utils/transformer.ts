import * as ts from 'typescript';
import * as chalk from './chalkConfig';
import {RedPill} from 'polymerts-models';
import {TransformChangeRecord, TransformChangeType, ConverterOptions} from './custom-types';

export class PolymerTsTransformerFactory {
	private _sourceFile: ts.SourceFile;
	private _targetPolymerVersion: number;
	private _options: ConverterOptions;
	private _transformer: PolymerTsTransformer;

	constructor(sourceFile: ts.SourceFile, options: ConverterOptions, targetPolymerVersion?: number) {
		this._sourceFile = sourceFile;
		this._targetPolymerVersion = targetPolymerVersion;
		this._options = options;
		this._transformer = new PolymerTsTransformer(this._options);
	}
	/**
	 * The transformer target Polymer "Major" version number. Defaults to 2.
	 * @type {number}
	 */
	get targetPolymerVersion() {
		return this._targetPolymerVersion || 2;
	}
	/**
	 * Set the default polymer version
	 * @param {number} targetPolymerVersion - Should be an integer
	 */
	set targetPolymerVersion(targetPolymerVersion: number) {
		this._targetPolymerVersion = targetPolymerVersion ? targetPolymerVersion : 2;
	}

	_preTransform(ctx: ts.TransformationContext) {
		console.log(chalk.processing('Analyzing source file for required changes...'));
	}

	transform(ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
		this._preTransform(ctx);
		let transformer: ts.Transformer<ts.SourceFile> = this._transformer.transform.apply(this._transformer, [ctx, this._sourceFile]);
		return transformer;
	}
}

export class PolymerTsTransformer {
	private _ctx: ts.TransformationContext;
	private _nodeMap: Map<ts.Node, ts.Node|null> = new Map();
	private _sourceFile: ts.SourceFile;
	private _changeRecords: TransformChangeRecord[] = [];
	private _options: ConverterOptions;
	private _transformNodeMap: Map<ts.Node, TransformChangeRecord> = new Map();

	constructor(options: ConverterOptions) {
		this._options = options;
	}

	get ctx() {
		return this._ctx;
	}

	set ctx(ctx: ts.TransformationContext) {
		this._ctx = ctx;
	}

	get nodeMap() {
		return this._nodeMap;
	}

	notifyUser(msg) {
		console.log(msg);
	}

	get options() {
		return this._options;
	}

	set options(options) {
		this._options = options;
	}
	/**
	 * PolymerTs Decorator Regular expressions
	 * @type {RegExp}
	 */
	get polymerTsDecoratorRegEx() {
		return {
			component: /(component\s*\((?:['"]{1}(.*)['"]{1})\))/g,
			extend: null,
			property: /(property\s*\(({[a-zA-Z0-9:,\s]*})\)\s*([\w\W]*);)/g,
			observe: /(observe\(([a-zA-Z0-9:,\s'".]*)?\))/,
			computed: /(computed\(({[a-zA-Z0-9:,\s]*})?\))/g,
			listen: /(listen\(([\w.\-'"]*)\))/,
			behavior: /(behavior\s*\((...*)\))/g,
			hostAttributes: null
		};
	}

	getTransformNodes(ctx: ts.TransformationContext, sf: ts.SourceFile) {
		this._sourceFile = sf;
		this._ctx = ctx;
		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			node = ts.visitEachChild(node, visitor, this._ctx);
			switch (node.kind) {
				case ts.SyntaxKind.ClassDeclaration:
					let classDecl = ts.isClassDeclaration(node) ? node as ts.ClassDeclaration : null;
					if (classDecl && RedPill.isComponent(classDecl, sf)) {
						let comp = new RedPill.Component(classDecl);
						comp.sourceFile = sf;
						this._transformNodeMap.set(classDecl, null);
					}
					break;
				case ts.SyntaxKind.ModuleDeclaration:
					break;
				case ts.SyntaxKind.MethodDeclaration:
					// TODO: We need to transform this one last so we have the required changes to members?
					let methodDeclNode = ts.isMethodDeclaration(node) ? node as ts.MethodDeclaration : null;
					if (methodDeclNode && RedPill.isComputedProperty(methodDeclNode, sf)) {
						let compProp = new RedPill.ComputedProperty(methodDeclNode);
						compProp.sourceFile = sf;
						this._transformNodeMap.set(methodDeclNode, null);
					}else if (methodDeclNode && RedPill.isListener(methodDeclNode, sf)) {
						let list = new RedPill.Listener(methodDeclNode);
						list.sourceFile = sf;
						this._transformNodeMap.set(methodDeclNode, null);
					}else if (methodDeclNode && RedPill.isObserver(methodDeclNode, sf)) {
						let obs = new RedPill.Observer(methodDeclNode);
						obs.sourceFile = sf;
						let chgRec: TransformChangeRecord = null;
						if (obs.params && obs.params.length === 1) {
							let propName = obs.params[0];
							chgRec = {
								changeType: TransformChangeType.PropertyChange,
								origNode: this._findExistingDeclaredProperty(propName)
							}
						}
						this._transformNodeMap.set(methodDeclNode, chgRec);
					}else {

					}
					break;
				case ts.SyntaxKind.PropertyDeclaration:
					let propDeclNode = ts.isPropertyDeclaration ? node as ts.PropertyDeclaration : null;
					if (propDeclNode && RedPill.isDeclaredProperty(propDeclNode)) {
						let prop = new RedPill.Property(propDeclNode);
						prop.sourceFile = sf;
						this._transformNodeMap.set(propDeclNode, null);
					}
					break;
				default:
					// do nothing
			}
			return node;
		}
	}
	/**
	 * This starts the visitor
	 * @param ctx {ts.TransformationContext}
	 * @returns {tx.Transformer<ts.SourceFile>}
	 */
	transform(ctx: ts.TransformationContext, sf: ts.SourceFile): ts.Transformer<ts.SourceFile> {
		this._sourceFile = sf;
		this._ctx = ctx;
		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			node = ts.visitEachChild(node, visitor, this._ctx);
			const rpNode = this._nodeMap.get(node);
			switch (node.kind) {
				case ts.SyntaxKind.ClassDeclaration:
					let classDecl = ts.isClassDeclaration(node) ? node as ts.ClassDeclaration : null;
					if (classDecl && RedPill.isComponent(classDecl, sf) && !rpNode) {
						let comp = new RedPill.Component(classDecl);
						comp.sourceFile = sf;
						this.notifyUser(chalk.processing('Transforming the ' + comp.name + '(' + (<any>ts).SyntaxKind[node.kind] + ') Component...'));
						let newClassDecl = this.transformClassDecl(classDecl);
						this._nodeMap.set(node, newClassDecl);
						return newClassDecl;
					}
					break;
				case ts.SyntaxKind.ModuleDeclaration:
					break;
				case ts.SyntaxKind.MethodDeclaration:
					// TODO: We need to transform this one last so we have the required changes to members?
					let methodDeclNode = ts.isMethodDeclaration(node) ? node as ts.MethodDeclaration : null;
					if (methodDeclNode && RedPill.isComputedProperty(methodDeclNode, sf) && !rpNode) {
						let compProp = new RedPill.ComputedProperty(methodDeclNode);
						compProp.sourceFile = sf;
						this.notifyUser(chalk.processing('Transforming the ' + compProp.name + '(' + (<any>ts).SyntaxKind[node.kind] + ') Computed Property...'));
						let newCompProp = this.transformComputedProp(methodDeclNode);
						this._nodeMap.set(node, newCompProp);
						return newCompProp;
					}else if (methodDeclNode && RedPill.isListener(methodDeclNode, sf) && !rpNode) {
						let list = new RedPill.Listener(methodDeclNode);
						list.sourceFile = sf;
						this.notifyUser(chalk.processing('Transforming the ' + list.eventName + '(' + (<any>ts).SyntaxKind[node.kind] + ') Listener...'));
						let newListener = this.transformListener(methodDeclNode);
						this._nodeMap.set(node, newListener);
						return newListener;
					}else if (methodDeclNode && RedPill.isObserver(methodDeclNode, sf) && !rpNode) {
						let obs = new RedPill.Observer(methodDeclNode);
						obs.sourceFile = sf;
						this.notifyUser(chalk.processing('Transforming the ' + obs.methodName + '(' + (<any>ts).SyntaxKind[node.kind] + ') Observer...'));
						let newObserver = this.transformObserver(methodDeclNode);
						this._nodeMap.set(node, newObserver);
						return newObserver;
					}else {
						this.notifyUser(chalk.processing('Recording \'' + methodDeclNode.name.getText(sf) + '\': Just a plain ole function, no modification required...'));
						this._nodeMap.set(node, null);
					}
					break;
				case ts.SyntaxKind.PropertyDeclaration:
					let propDeclNode = ts.isPropertyDeclaration ? node as ts.PropertyDeclaration : null;
					if (propDeclNode && RedPill.isDeclaredProperty(propDeclNode) && !rpNode) {
						let prop = new RedPill.Property(propDeclNode);
						prop.sourceFile = sf;
						this.notifyUser(chalk.processing('Parsing the ' + prop.name + '(' + (<any>ts).SyntaxKind[node.kind] + ') Property...'));
						let newProp = this.transformProperty(propDeclNode);
						this._nodeMap.set(node, newProp);
						return newProp;
					}else {
						this.notifyUser(chalk.processing('Skipping \'' + propDeclNode.name.getText(sf) + '\': Not a Declared Property...'));
					}
					break;
				default:
					this.notifyUser(chalk.processing('Skipping ' + (<any>ts).SyntaxKind[node.kind]));
			}
			return node;
		}
		return (rootNode): ts.SourceFile => {
			return ts.visitNode(rootNode, visitor);
		}
	}

	transformDecorator(parentNode: ts.Node, polymerTsRegEx: RegExp, newDecoratorText: string) {
		let decorators = parentNode.decorators;
		let newDecorator: ts.Decorator = null;
		for (let i = 0; i < decorators.length; i++) {
			let dec: ts.Decorator = <ts.Decorator> decorators[i];
			let decText = dec.expression.getText(this._sourceFile);
			let decTextMatch = polymerTsRegEx.exec(decText);
			if (decTextMatch && decTextMatch.length > 0) {
				let args = (<ts.CallExpression> dec.expression).arguments;
				let newIdent: ts.Identifier = ts.createIdentifier(newDecoratorText);
				let newCallExp: ts.CallExpression = ts.createCall(
					newIdent,
					undefined,
					args
				);
				newDecorator = ts.updateDecorator(dec, newCallExp);
				break;
			}
		}
		return newDecorator;
	}

	transformClassDecl(classDecl: ts.ClassDeclaration): ts.ClassDeclaration {
		let newClassDecl: ts.ClassDeclaration = null;
		if (classDecl && ts.isClassDeclaration(classDecl)) {
			let newDecorator = this.transformDecorator(classDecl, this.polymerTsDecoratorRegEx.component, 'customElement');
			let decorators = classDecl.decorators;
			if (newDecorator && decorators && decorators.length > 0) {
				let behaviors: RedPill.IncludedBehavior[] = this._getComponentBehaviors(classDecl);
				let heritages: ts.HeritageClause[] = [].concat(classDecl.heritageClauses);
				let newHeritage: ts.HeritageClause[] = [];
				if (decorators.length > 1) { // We have behaviors here
					if (this.options.applyGestureEventListenersMixin && this.options.applyDeclarativeEventListenersMixin) {



						let extendsExpression = ts.createExpressionWithTypeArguments(
							/* ts.TypeNode[] */ undefined,
							/* ts.Expression */ undefined
						)
						let newHeritageClause = ts.createHeritageClause(
							ts.SyntaxKind.ExtendsKeyword,
							/* ts.ExpressionWithTypeArguments[] */ [extendsExpression]
						);
					}
				}else if (decorators.length === 1) { // No Behaviors defined
					newHeritage = heritages;
				}
				newClassDecl = ts.updateClassDeclaration(
					/* ts.ClassDeclaration */ classDecl,
					/* ts.Decorator[] */ [newDecorator],
					/* ts.Modifier[] */ classDecl.modifiers,
					/* ts.Identifier */ classDecl.name,
					/* ts.TypeParameterDeclaration */ classDecl.typeParameters,
					/* ts.HeritageClause[] */ newHeritage,
					/* ts.ClassElement[] */ classDecl.members
				);
			}
		}
		return newClassDecl;
	}

	transformComputedProp(methodDecl: ts.MethodDeclaration): ts.GetAccessorDeclaration {
		let newGetter: ts.GetAccessorDeclaration = null;
		if (methodDecl && ts.isMethodDeclaration(methodDecl)) {
			let newDecorators: ts.Decorator[] = [];
			let newArgs: ts.StringLiteral[] = [];
			for (let i = 0; i < methodDecl.parameters.length; i++) {
				let arg: ts.ParameterDeclaration = <ts.ParameterDeclaration> methodDecl.parameters[i];
				let argName = arg.name.getText(this._sourceFile);
				let newArg = ts.createStringLiteral(argName);
				newArgs.push(newArg);
			}
			for (let i = 0; i < methodDecl.decorators.length; i++) {
				let decorator: ts.Decorator = methodDecl.decorators[i];
				let newIdent = ts.createIdentifier('computed');

				let newCallExp = ts.createCall(
					/* ts.Expression */ newIdent,
					/* ts.TypeNode[] */ undefined,
					/* ts.Expression[] */ newArgs
				);
				let newDecorator = ts.updateDecorator(
					/* ts.Decorator */ decorator,
					/* ts.CallExpression */ newCallExp
				);
				newDecorators.push(newDecorator);
			}
			let propertyName: ts.Identifier = <ts.Identifier> methodDecl.name;
			// TODO: Need to parse the body looking for property names and change them to use "this.propertyName"
			newGetter = ts.createGetAccessor(
				/* ts.Decorator[] */ newDecorators,
				/* ts.Modifier[] */ undefined,
				/* ts.Identifier|ts.StringLiteral */ propertyName,
				/* ts.ParameterDeclaration[] */ undefined,
				/* ts.TypeNode */ undefined,
				/* ts.Block */ methodDecl.body
			);
		}
		return newGetter;
	}

	transformObserver(methodDecl: ts.MethodDeclaration): ts.Node {
		if (methodDecl && ts.isMethodDeclaration(methodDecl)) {
			let decorator:ts.Decorator = null;
			if (methodDecl.decorators && methodDecl.decorators.length > 0) {
				decorator = <ts.Decorator> methodDecl.decorators[0];
				let callExp: ts.CallExpression = <ts.CallExpression> decorator.expression;
				let moveSingles = this.options.moveSinglePropertyObserversToProperty;
				if (callExp.arguments && callExp.arguments.length === 1 && moveSingles) {
					let argName = callExp.arguments[0].getText(this._sourceFile);
					argName = argName ? argName.replace(/[\'"]*/g, '') : argName;
					// Find existing property
					let existingProp = this._findExistingDeclaredProperty(argName);
					if (existingProp) {
						let methodName = methodDecl.name.getText(this._sourceFile);
						let updatedProp = this._addPropertyToPropertyDecl(existingProp, 'observer', methodName);
						let postChangeRec: TransformChangeRecord = {
							origNode: existingProp,
							changeType: TransformChangeType.PropertyChange,
							newNode: updatedProp,
							removeDecorator: decorator
						}
						this._changeRecords.push(postChangeRec);
						methodDecl = ts.updateMethod(
							methodDecl,
							[],
							methodDecl.modifiers,
							methodDecl.asteriskToken,
							methodDecl.name,
							methodDecl.questionToken,
							methodDecl.typeParameters,
							methodDecl.parameters,
							methodDecl.type,
							methodDecl.body
						)
					}
				}
			}
		}
		return methodDecl;
	}

	transformListener(methodDecl: ts.MethodDeclaration): ts.MethodDeclaration {
		if (methodDecl && ts.isMethodDeclaration(methodDecl) && methodDecl.decorators && methodDecl.decorators.length > 0) {
			let classDecl = this._findExistingClassDeclaration();
			if (this.options.applyDeclarativeEventListenersMixin) {
				this._addRefNodeChangeRecord(classDecl, null, this.options.pathToBowerComponents + 'polymer-decorators/mixins/declarative-event-listeners.d.ts');
				if (this.options.applyGestureEventListenersMixin) {
					this._addRefNodeChangeRecord(classDecl, null, this.options.pathToBowerComponents + 'polymer-decorators/mixins/gesture-event-listeners.d.ts');
				}
			}else {
				let readyMethod = this._findReadyMethod();
				this._changeRecords.push({
					changeType: TransformChangeType.AddListenerToReady,
					origNode: readyMethod,
					newNode: null,
					listenerMethod: methodDecl,
					createReadyMethod: readyMethod ? false : true
				});
			}
		}
		return methodDecl;
	}

	transformProperty(propertyDecl: ts.PropertyDeclaration): ts.PropertyDeclaration {
		return propertyDecl;
	}

	_findExistingDeclaredProperty(propertyName: string) {
		let existingProp = null;
		this._nodeMap.forEach((val: ts.Node, key: ts.Node, map: Map<ts.Node, ts.Node>) => {
			if (ts.isPropertyDeclaration(key) && RedPill.isDeclaredProperty(key)) {
				let rpProp = new RedPill.Property(key);
				rpProp.sourceFile = this._sourceFile;
				let name = rpProp.name;
				if (name === propertyName) {
					existingProp = key
				}
			}
		});
		return existingProp;
	}

	_findExistingClassDeclaration() {
		let existingClass = null;
		this._nodeMap.forEach((val: ts.Node, key: ts.Node, map: Map<ts.Node, ts.Node>) => {
			if (ts.isClassDeclaration(key) && RedPill.isComponent(key, this._sourceFile)) {
				existingClass = key;
			}
		});
		return existingClass;
	}

	_findReadyMethod() {
		let readyMeth = null;
		this._nodeMap.forEach((val: ts.Node, key: ts.Node, map: Map<ts.Node, ts.Node>) => {
			if (ts.isMethodDeclaration(key)) {
				let methodName = key.name.getText(this._sourceFile);
				if (methodName === 'ready') {
					readyMeth = key;
				}
			}
		});
		return readyMeth;
	}

	_addPropertyToPropertyDecl(property: ts.PropertyDeclaration, newPropName: string, newPropInitializer: string) {
		let updatedProp = null;
		if (property) {
			let existingPropDec = property.decorators && property.decorators.length > 0 ? property.decorators[0] : null;
			let objLit = (<ts.ObjectLiteralExpression> (<ts.CallExpression> existingPropDec.expression).arguments[0])
			let propProps = [];
			for (let i = 0; i < objLit.properties.length; i++) {
				let propProp = objLit.properties[i];
				propProps.push(propProp);
			}
			let newPropProp = ts.createPropertyAssignment(
				/* string|ts.Identifier */ newPropName,
				/* ts.Expression initializer */ ts.createIdentifier(newPropInitializer)
			);
			propProps.push(newPropProp);

			let newPropObj = ts.createObjectLiteral(
				/* ts.ObjectLiteralElementLike properties */ propProps,
				/* multiLine */ true
			);

			let newIdent = ts.createIdentifier('property');
			let newArgs = [newPropObj];
			let newCallExp = ts.createCall(
				/* ts.Expression */ newIdent,
				/* ts.TypeNode */ undefined,
				/* ts.Expression[] args */ newArgs
			);

			let newDecorator = ts.createDecorator(newCallExp);
			updatedProp = ts.createProperty(
				/* ts.Decorator[] */ [newDecorator],
				/* ts.Modifier[] */ undefined,
				/* string|ts.Identifier */ property.name,
				/* ts.Token<QuestionToken|ExclamationToken> */ undefined,
				/* ts.TypeNode */ property.type,
				/* ts.Expression initializer */ property.initializer
			);
		}
		return updatedProp;
	}

	_getComponentBehaviors(classDecl: ts.ClassDeclaration) {
		let decorators = classDecl.decorators;
		let behaviors: RedPill.IncludedBehavior[] = [];
		if (decorators && decorators.length > 0) {
			for (let i = 0; i < decorators.length; i++) {
				let decorator = decorators[i];
				let decText = decorator.expression.getText(this._sourceFile);
				let decTextMatchBehavior = this.polymerTsDecoratorRegEx.behavior.exec(decText);
				if (decTextMatchBehavior && decTextMatchBehavior.length > 0) {
					let rpBehavior = new RedPill.IncludedBehavior();
					rpBehavior.sourceFile = this._sourceFile;
					rpBehavior.decorator = decorator;
					behaviors.push(rpBehavior);
				}
			}
		}
		return behaviors;
	}

	_addRefNodeChangeRecord(origNode: ts.Node, newNode: ts.Node, refPath: string) {
		let refNodeChg: TransformChangeRecord = {
			changeType: TransformChangeType.AddTSReferenceTag,
			origNode: origNode,
			newNode: newNode,
			refNodePath: refPath
		};
		this._changeRecords.push(refNodeChg);
	}
}
