import * as ts from 'typescript';
import {RedPill} from 'polymerts-models';
import * as chalk from './chalkConfig';

export class PolymerTsTransformerFactory {
	private _sourceFile: ts.SourceFile;

	constructor(sourceFile: ts.SourceFile) {
		this._sourceFile = sourceFile;
	}

	transform(ctx: ts.TransformationContext) {
		const transformer = new PolymerTsTransformer();
		transformer.ctx = ctx;
		return transformer.transform.apply(transformer, [ctx, this._sourceFile]);
	}
}

export class PolymerTsTransformer {
	private _ctx: ts.TransformationContext;
	private _nodeMap: Map<ts.Node, ts.Node|null> = new Map();
	private _sourceFile: ts.SourceFile;

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
	 * This starts the visitor. Seems we loose the reference to "this"
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
						let newDecorator = this.transformDecorator(classDecl, this.polymerTsDecoratorRegEx.computed, 'customElement');

						this._nodeMap.set(node, null);
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
					this._nodeMap.set(node, null);
					// TODO: We need to transform this one last so we have the required changes to members
					}else if (methodDeclNode && RedPill.isListener(methodDeclNode, sf) && !rpNode) {
						let list = new RedPill.Listener(methodDeclNode);
						list.sourceFile = sf;
						this.notifyUser(chalk.processing('Parsing the ' + list.eventName + '(' + (<any>ts).SyntaxKind[node.kind] + ') Listener...'));
						let newDecorator = this.transformDecorator(methodDeclNode, this.polymerTsDecoratorRegEx.computed, 'listener');

						this._nodeMap.set(node, null);
					}else if (methodDeclNode && RedPill.isObserver(methodDeclNode, sf) && !rpNode) {
						let obs = new RedPill.Observer(methodDeclNode);
						obs.sourceFile = sf;
						this.notifyUser(chalk.processing('Parsing the ' + obs.methodName + '(' + (<any>ts).SyntaxKind[node.kind] + ') Observer...'));
						let newDecorator = this.transformDecorator(methodDeclNode, this.polymerTsDecoratorRegEx.computed, 'observe');

						this._nodeMap.set(node, null);
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
						let newDecorator = this.transformDecorator(propDeclNode, this.polymerTsDecoratorRegEx.computed, 'property');

						this._nodeMap.set(node, null);
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
				let ident = ts.createIdentifier(newDecoratorText);
				newDecorator = ts.updateDecorator(dec, ident);
				break;
			}
		}
		return newDecorator;
	}

	transformClassDecl(classDecl: ts.ClassDeclaration) {
		if (!this.nodeMap.get(classDecl)) {
			let newDecorator = this.transformDecorator(classDecl, this.polymerTsDecoratorRegEx.component, 'customElement');
		}
		return classDecl;
	}
}
