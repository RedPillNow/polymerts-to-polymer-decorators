/**
 * Some of the patterns in this file were taken from:
 * https://github.com/kriszyp/ts-transform-safely/blob/master/src/transform.ts
 */
import * as ts from 'typescript';
import { RedPill } from 'polymerts-models';
import * as chalk from './chalkConfig';

function visitor(ctx: ts.TransformationContext, sf: ts.SourceFile): ts.Visitor {
	const visitor: ts.Visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
		switch (node.kind) {
			case ts.SyntaxKind.ClassDeclaration:
				let classDecl: ts.ClassDeclaration = <ts.ClassDeclaration> node;
				if (RedPill.isComponent(classDecl)) {
					let comp = new RedPill.Component(classDecl);
					notifyUser(chalk.processing('Parsing the ' + comp.name + '(' + (<any>ts).SyntaxKind[node.kind] + ') Component...'));
					let origDecorator = comp.decorator;
					let origDecoratorExp: ts.Expression = origDecorator.expression;
					let text = origDecoratorExp.modifiers;
					let foo;
				}
				break;
			case ts.SyntaxKind.ModuleDeclaration:
				break;
			case ts.SyntaxKind.MethodDeclaration:
				let methodDeclNode: ts.MethodDeclaration = <ts.MethodDeclaration> node;
				if (RedPill.isComputedProperty(methodDeclNode)) {
					let compProp = new RedPill.ComputedProperty(methodDeclNode);
					notifyUser(chalk.processing('Parsing the ' + compProp.name + '(' + (<any>ts).SyntaxKind[node.kind] + ') Computed Property...'));
				}else if (RedPill.isListener(methodDeclNode)) {
					let list = new RedPill.Listener(methodDeclNode);
					notifyUser(chalk.processing('Parsing the ' + list.eventName + '(' + (<any>ts).SyntaxKind[node.kind] + ') Listener...'));
				}else if (RedPill.isObserver(methodDeclNode)) {
					let obs = new RedPill.Observer(methodDeclNode);
					notifyUser(chalk.processing('Parsing the ' + obs.methodName + '(' + (<any>ts).SyntaxKind[node.kind] + ') Observer...'));
				}else {
					notifyUser(chalk.processing('Skipping \'' + methodDeclNode.name.getText() + '\': Just a plain ole function...'));
				}
				break;
			case ts.SyntaxKind.PropertyDeclaration:
				let propDeclNode: ts.PropertyDeclaration = <ts.PropertyDeclaration> node;
				if (RedPill.isDeclaredProperty(propDeclNode)) {
					let prop = new RedPill.Property(node);
					notifyUser(chalk.processing('Parsing the ' + prop.name + '(' + (<any>ts).SyntaxKind[node.kind] + ') Property...'));
				}else {
					notifyUser(chalk.processing('Skipping \'' + propDeclNode.name.getText() + '\': Not a Declared Property...'));
				}
				break;
			default:
				// notifyUser(chalk.processing('Skipping ' + (<any>ts).SyntaxKind[node.kind]));
		}
		return ts.visitEachChild(node, visitor, ctx);
	}
	return visitor;
}

function notifyUser(msg) {
	console.log(msg);
}

export default function() {
	return (ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> => {
		return (sf: ts.SourceFile) => ts.visitNode(sf, visitor(ctx, sf))
	}
}
