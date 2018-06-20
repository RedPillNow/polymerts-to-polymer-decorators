import * as ts from 'typescript';
import * as chalk from './chalkConfig';
import {RedPill} from 'polymerts-models';

export class TypescriptNodeEmitter {
	getSourceMap(sourceFile: ts.SourceFile): [ts.SourceFile, Map<ts.Node, ts.Node>] {
		const converter = new NodeEmitterVisitor();
		const statements: ts.NodeArray<ts.Statement> = sourceFile.statements;
		const sourceStatements = [...statements];
		converter.updateSourceMap(sourceFile);
		const newSourceFile = ts.updateSourceFileNode(sourceFile, sourceStatements);
		return [newSourceFile, converter.getNodeMap()]
	}
}

export class NodeEmitterVisitor {
	private _nodeMap = new Map<ts.Node, ts.Node|null>();

	updateSourceMap(sourceFile: ts.SourceFile): void {
		let statements = sourceFile.statements;
		const visitNode = (tsNode: ts.Node) => {
			const rpNode = this._nodeMap.get(tsNode);
			switch (tsNode.kind) {
				case ts.SyntaxKind.ClassDeclaration:
					let classDecl = ts.isClassDeclaration(tsNode) ? tsNode as ts.ClassDeclaration : null;
					if (classDecl && RedPill.isComponent(classDecl)) {
						let comp = new RedPill.Component(classDecl);
						notifyUser(chalk.processing('Parsing the ' + comp.name + '(' + (<any>ts).SyntaxKind[tsNode.kind] + ') Component...'));
						this._nodeMap.set(tsNode, null);
					}
					break;
				case ts.SyntaxKind.ModuleDeclaration:
					break;
				case ts.SyntaxKind.MethodDeclaration:
					let methodDeclNode = ts.isMethodDeclaration(tsNode) ? tsNode as ts.MethodDeclaration : null;
					if (methodDeclNode && RedPill.isComputedProperty(methodDeclNode)) {
						let compProp = new RedPill.ComputedProperty(methodDeclNode);
						notifyUser(chalk.processing('Parsing the ' + compProp.name + '(' + (<any>ts).SyntaxKind[tsNode.kind] + ') Computed Property...'));
						this._nodeMap.set(tsNode, null);
					}else if (methodDeclNode && RedPill.isListener(methodDeclNode)) {
						let list = new RedPill.Listener(methodDeclNode);
						notifyUser(chalk.processing('Parsing the ' + list.eventName + '(' + (<any>ts).SyntaxKind[tsNode.kind] + ') Listener...'));
						this._nodeMap.set(tsNode, null);
					}else if (methodDeclNode && RedPill.isObserver(methodDeclNode)) {
						let obs = new RedPill.Observer(methodDeclNode);
						notifyUser(chalk.processing('Parsing the ' + obs.methodName + '(' + (<any>ts).SyntaxKind[tsNode.kind] + ') Observer...'));
						this._nodeMap.set(tsNode, null);
					}else {
						notifyUser(chalk.processing('Skipping \'' + methodDeclNode.name.getText() + '\': Just a plain ole function, no modification required...'));
					}
					break;
				case ts.SyntaxKind.PropertyDeclaration:
					let propDeclNode = ts.isPropertyDeclaration ? tsNode as ts.PropertyDeclaration : null;
					if (propDeclNode && RedPill.isDeclaredProperty(propDeclNode)) {
						let prop = new RedPill.Property(propDeclNode);
						notifyUser(chalk.processing('Parsing the ' + prop.name + '(' + (<any>ts).SyntaxKind[tsNode.kind] + ') Property...'));
						this._nodeMap.set(tsNode, null);
					}else {
						notifyUser(chalk.processing('Skipping \'' + propDeclNode.name.getText() + '\': Not a Declared Property...'));
					}
					break;
				default:
					notifyUser(chalk.processing('Skipping ' + (<any>ts).SyntaxKind[node.kind]));
			}
			ts.forEachChild(tsNode, visitNode);
		}
		statements.forEach(visitNode);
	}
	/**
	 * This will actually be a Map (TypeScript/ES6) formatted like
	 * {oldNode: newNode}
	 * This allows us to get a node from the map by passing in the node itself instead of attempting
	 * to assign it an id and keep track of the id.
	 */
	getNodeMap() {
		return this._nodeMap;
	}
}

function notifyUser(msg) {
	console.log(msg);
}
