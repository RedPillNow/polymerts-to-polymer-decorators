import * as ts from 'typescript';
import * as chalk from './chalkConfig';
import {RedPill} from 'polymerts-models';
import {PostTransformChangeRecord, ChangeType, ConverterOptions} from './custom-types';

export class PolymerTsTransformerFactory {
	private _sourceFile: ts.SourceFile;
	private _targetPolymerVersion: number;
	private _options: ConverterOptions;

	constructor(sourceFile: ts.SourceFile, options: ConverterOptions, targetPolymerVersion?: number) {
		this._sourceFile = sourceFile;
		this._targetPolymerVersion = targetPolymerVersion;
		this._options = options;
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

	transform(ctx: ts.TransformationContext) {
		const transformer = new PolymerTsTransformer(ctx, this._options);
		return transformer.transform.apply(transformer, [ctx, this._sourceFile]);
	}
}

export class PolymerTsTransformer {
	private _ctx: ts.TransformationContext;
	private _nodeMap: Map<ts.Node, ts.Node|null> = new Map();
	private _sourceFile: ts.SourceFile;
	private _changeRecords: PostTransformChangeRecord[] = [];
	private _options: ConverterOptions;

	constructor(ctx: ts.TransformationContext, options: ConverterOptions) {
		this._ctx = ctx;
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
	/**
	 * This starts the visitor
	 * @param ctx {ts.TransformationContext}
	 * @returns {tx.Transformer<ts.SourceFile>}
	 */
	transform(ctx: ts.TransformationContext, sf: ts.SourceFile): ts.Transformer<ts.SourceFile> {
		this._sourceFile = sf;
		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			node = ts.visitEachChild(node, visitor, this._ctx);
			const rpNode = this._nodeMap.get(node);
			switch (node.kind) {
				case ts.SyntaxKind.ClassDeclaration:
					let classDecl = ts.isClassDeclaration(node) ? node as ts.ClassDeclaration : null;
					if (classDecl && RedPill.isComponent(classDecl, sf) && !rpNode) {
						let comp = new RedPill.Component(classDecl);
						comp.sourceFile = sf;
						this.notifyUser(chalk.processing('Parsing the ' + comp.name + '(' + (<any>ts).SyntaxKind[node.kind] + ') Component...'));
						// let newClassDecl = this.transformClassDecl(classDecl);
						this._nodeMap.set(node, null);
						// return newClassDecl;
					}
					break;
				case ts.SyntaxKind.ModuleDeclaration:
					break;
				case ts.SyntaxKind.MethodDeclaration:
					let methodDeclNode = ts.isMethodDeclaration(node) ? node as ts.MethodDeclaration : null;
					if (methodDeclNode && RedPill.isComputedProperty(methodDeclNode, sf) && !rpNode) {
						let compProp = new RedPill.ComputedProperty(methodDeclNode);
						compProp.sourceFile = sf;
						this.notifyUser(chalk.processing('Parsing the ' + compProp.name + '(' + (<any>ts).SyntaxKind[node.kind] + ') Computed Property...'));
						let newCompProp = this.transformComputedProp(methodDeclNode);
						this._nodeMap.set(node, newCompProp);
						return newCompProp;
					// TODO: We need to transform this one last so we have the required changes to members
					}else if (methodDeclNode && RedPill.isListener(methodDeclNode, sf) && !rpNode) {
						let list = new RedPill.Listener(methodDeclNode);
						list.sourceFile = sf;
						this.notifyUser(chalk.processing('Parsing the ' + list.eventName + '(' + (<any>ts).SyntaxKind[node.kind] + ') Listener...'));
						let newListener = this.transformListener(methodDeclNode);
						this._nodeMap.set(node, newListener);
						return newListener;
					}else if (methodDeclNode && RedPill.isObserver(methodDeclNode, sf) && !rpNode) {
						let obs = new RedPill.Observer(methodDeclNode);
						obs.sourceFile = sf;
						this.notifyUser(chalk.processing('Parsing the ' + obs.methodName + '(' + (<any>ts).SyntaxKind[node.kind] + ') Observer...'));
						let newObserver = this.transformObserver(methodDeclNode);
						this._nodeMap.set(node, newObserver);
						return newObserver;
					}else {
						this.notifyUser(chalk.processing('Skipping \'' + methodDeclNode.name.getText(sf) + '\': Just a plain ole function, no modification required...'));
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
				let newCallExp: ts.CallExpression = ts.createCall(newIdent, undefined, args);
				newDecorator = ts.updateDecorator(dec, newIdent);
				break;
			}
		}
		return newDecorator;
	}

	transformClassDecl(classDecl: ts.ClassDeclaration): ts.ClassDeclaration {
		if (!this.nodeMap.get(classDecl)) {
			let newDecorator = this.transformDecorator(classDecl, this.polymerTsDecoratorRegEx.component, 'customElement');
		}
		return classDecl;
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
						let postChangeRec: PostTransformChangeRecord = {
							origNode: existingProp,
							changeType: ChangeType.PropertyChange,
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
		if (this.options.applyDeclarativeEventListenersMixin && methodDecl && ts.isMethodDeclaration(methodDecl)) {

		}else if (!this.options.applyDeclarativeEventListenersMixin) {
			// TODO: Need to add actual event listeners somewhere, attached() maybe?
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
}
