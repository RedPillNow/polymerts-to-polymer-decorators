/**
 * Some of the patterns in this file were taken from:
 * https://github.com/kriszyp/ts-transform-safely/blob/master/src/transform.ts
 */
import * as ts from 'typescript';
import { RedPill } from 'polymerts-models';
import * as chalk from './chalkConfig';
import {PolymerTsRegEx} from './regular-expressions';

let warnings: RedPill.Warning[] = [];

function visitor(ctx: ts.TransformationContext, sf: ts.SourceFile): ts.Visitor {
	const visitor: ts.Visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
		switch (node.kind) {
			case ts.SyntaxKind.ClassDeclaration:
				let classDecl = ts.isClassDeclaration(node) ? node as ts.ClassDeclaration : null;
				if (classDecl && RedPill.isComponent(classDecl)) {
					let comp = new RedPill.Component(classDecl);
					notifyUser(chalk.processing('Parsing the ' + comp.name + '(' + (<any>ts).SyntaxKind[node.kind] + ') Component...'));
					let newClassDecl = classDeclTransform(classDecl, comp);
				}
				break;
			case ts.SyntaxKind.ModuleDeclaration:
				break;
			case ts.SyntaxKind.MethodDeclaration:
				let methodDeclNode = ts.isMethodDeclaration(node) ? node as ts.MethodDeclaration : null;
				if (methodDeclNode && RedPill.isComputedProperty(methodDeclNode)) {
					let compProp = new RedPill.ComputedProperty(methodDeclNode);
					notifyUser(chalk.processing('Parsing the ' + compProp.name + '(' + (<any>ts).SyntaxKind[node.kind] + ') Computed Property...'));
				}else if (methodDeclNode && RedPill.isListener(methodDeclNode)) {
					let list = new RedPill.Listener(methodDeclNode);
					notifyUser(chalk.processing('Parsing the ' + list.eventName + '(' + (<any>ts).SyntaxKind[node.kind] + ') Listener...'));
				}else if (methodDeclNode && RedPill.isObserver(methodDeclNode)) {
					let obs = new RedPill.Observer(methodDeclNode);
					notifyUser(chalk.processing('Parsing the ' + obs.methodName + '(' + (<any>ts).SyntaxKind[node.kind] + ') Observer...'));
				}else {
					notifyUser(chalk.processing('Skipping \'' + methodDeclNode.name.getText() + '\': Just a plain ole function, no modification required...'));
				}
				break;
			case ts.SyntaxKind.PropertyDeclaration:
				let propDeclNode = ts.isPropertyDeclaration ? node as ts.PropertyDeclaration : null;
				if (propDeclNode && RedPill.isDeclaredProperty(propDeclNode)) {
					let prop = new RedPill.Property(propDeclNode);
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

function classDeclTransform(classDecl: ts.ClassDeclaration, comp: RedPill.Component): ts.ClassDeclaration {
	let decorators = classDecl.decorators;
	let newDecorators = [];
	for (let i = 0; i < decorators.length; i++) {
		let dec: ts.Decorator = <ts.Decorator> decorators[i];
		let expText = dec.expression.getText();
		console.log(chalk.processing('Processing ' + expText + ' decorator...'));
		let decTextMatch = PolymerTsRegEx.polymerTSRegEx.component.exec(expText);
		let behTextMatch = PolymerTsRegEx.polymerTSRegEx.behavior.exec(expText);
		if (decTextMatch && decTextMatch.length > 0) {
			// Change the decorator
			newDecorators.push(updateDecorator(dec, 'customElement'));
		}else if (behTextMatch && behTextMatch.length > 0) {
			// TODO: Change the class declaration signature
			// Remove the behavior decorator
			// Warn for now
			let behaviorArgs = (<ts.CallExpression> dec.expression).arguments;
			let behaviorName = (<ts.MemberExpression> behaviorArgs[0]).getText();
			let warning = new RedPill.Warning('Behavior: ' + behaviorName + ' is not included in the transform');
			warning.tsNode = dec;
			warnings.push(warning);
		}
	}
	let newClassDecl = ts.updateClassDeclaration(
		classDecl,
		newDecorators,
		classDecl.modifiers,
		classDecl.name,
		classDecl.typeParameters,
		classDecl.heritageClauses,
		classDecl.members);
	return newClassDecl;
}

function methodDeclTransform(method: ts.MethodDeclaration, programPart: RedPill.ProgramPart): ts.MethodDeclaration {

	return null;
}

function updateDecorator(decorator: ts.Decorator, newDecoratorTxt: string): ts.Decorator {
	let expText = decorator.expression.getText();
	console.log(chalk.processing('Modifying ' + expText + ' decorator...'));
	let args = (<ts.CallExpression> decorator.expression).arguments;
	let newIdent: ts.Identifier = ts.createIdentifier(newDecoratorTxt);
	let newCallExp: ts.CallExpression = ts.createCall(newIdent, undefined, args);
	let newDecorator = ts.createDecorator(newCallExp);
	return newDecorator;
}

function notifyUser(msg) {
	console.log(msg);
}

export default function() {
	return (ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> => {
		return (sf: ts.SourceFile) => ts.visitNode(sf, visitor(ctx, sf))
	}
}
