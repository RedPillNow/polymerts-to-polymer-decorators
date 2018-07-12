import * as ts from 'typescript';
import {RedPill} from 'polymerts-models';
import {TransformChangeType, RefNodeCreateChangeRecord, PropertyOptions, TransformChangeRecord, ConverterOptions} from './custom-types';

/**
 * Collection of regular expressions to match PolymerTs Decorators
 * @type {Object<string,RegExp}
 */
export const polymerTsRegEx = {
	component: /(component\s*\((?:['"]{1}(.*)['"]{1})\))/,
	property: /(property\s*\(({[a-zA-Z0-9:,\s]*})\)\s*([\w\W]*);)/,
	observe: /(observe\(([a-zA-Z0-9:,\s'".]*)?\))/,
	computed: /(computed\(({[a-zA-Z0-9:,\s]*})?\))/,
	listen: /(listen\(([\w.\-'"]*)\))/,
	behavior: /(behavior\s*\((...*)\))/
};
/**
 * Get the arguments from a Decorator or MethodDeclaration
 * @param paramsFromNode {ts.Decorator | ts.MethodDeclaration}
 * @param sf {ts.SourceFile}
 * @return {ts.StringLiteral[]}
 */
export function getArgsFromNode(paramsFromNode: ts.Decorator|ts.MethodDeclaration, sf: ts.SourceFile): ts.StringLiteral[] {
	let newArgs: ts.StringLiteral[] = [];
	if (ts.isDecorator(paramsFromNode)) {
		const dec: ts.Decorator = <ts.Decorator> paramsFromNode;
		const callExp: ts.CallExpression = <ts.CallExpression> dec.expression;
		if (callExp.arguments && callExp.arguments.length > 0) {
			let currentArg = callExp.arguments[0];
			if (currentArg && currentArg.getText(sf).indexOf(',') > -1) {
				let argStrs = currentArg.getText(sf).split(',');
				for (let i = 0; i < argStrs.length; i++) {
					let arg = argStrs[i];
					arg = arg.replace(/[\'\"\s]/g, '');
					newArgs.push(ts.createStringLiteral(arg));
				}
			}else {
				for (let i = 0; i < callExp.arguments.length; i++) {
					newArgs.push(ts.createStringLiteral(callExp.arguments[i].getText(sf)));
				}
			}
		}
	}else if (ts.isMethodDeclaration(paramsFromNode)) {
		const methodDecl: ts.MethodDeclaration = <ts.MethodDeclaration> paramsFromNode;
		if (methodDecl.parameters && methodDecl.parameters.length > 0) {
			for (let i = 0; i < methodDecl.parameters.length; i++) {
				let arg: ts.ParameterDeclaration = <ts.ParameterDeclaration> methodDecl.parameters[i];
				let argName = arg.name.getText(sf);
				let newArg = ts.createStringLiteral(argName);
				newArgs.push(newArg);
			}
		}
	}
	return newArgs;
}
/**
 * Get the value property from a property decorator argument. The return value will generally
 * be used in addInitializerToPropertyDecl
 * @param propDecl {ts.PropertyDeclaration}
 * @param sf {ts.SourceFile}
 * @return {ts.Expression}
 */
export function getPropertyValueExpression(propDecl: ts.PropertyDeclaration, sf: ts.SourceFile): ts.Expression {
	let valueExp: ts.Expression = null;
	if (propDecl) {
		let existingPropDec = getPolymerTsDecorator(propDecl, sf);
		if (!existingPropDec) {
			existingPropDec = propDecl.decorators[0];
		}
		let objLit = (<ts.ObjectLiteralExpression> (<ts.CallExpression> existingPropDec.expression).arguments[0])
		valueExp = getObjectLiteralPropertyExpression(objLit, 'value', sf);
	}
	return valueExp;
}
/**
 * Get the intializer of a PropertyAssignment based on the propName
 * @param objLit {ts.ObjectLiteralExpression}
 * @param propName {string}
 * @param sf {ts.SourceFile}
 */
export function getObjectLiteralPropertyExpression(objLit: ts.ObjectLiteralExpression, propName: string, sf: ts.SourceFile): ts.Expression {
	if (objLit && ts.isObjectLiteralExpression(objLit) && objLit.properties) {
		for (let i = 0; i < objLit.properties.length; i++) {
			let prop: ts.ObjectLiteralElementLike = objLit.properties[i];
			if (prop.name.getText(sf) === propName && ts.isPropertyAssignment(prop)) {
				let propAssign: ts.PropertyAssignment = <ts.PropertyAssignment> prop;
				return propAssign.initializer;
			}
		}
	}
	return null;
}
/**
 * Remove a property from an Object Literal Expression
 * @param objLit {ts.ObjectLiteralExpression}
 * @param propName {string}
 * @param sf {ts.SourceFile}
 */
export function removePropertyFromObjectLiteral(objLit: ts.ObjectLiteralExpression, propName: string, sf: ts.SourceFile): ts.ObjectLiteralExpression {
	let newObjLit = objLit;
	if (objLit && ts.isObjectLiteralExpression(objLit) && objLit.properties) {
		let props = [].concat(objLit.properties);
		for (let i = 0; i < props.length; i++) {
			let prop: ts.ObjectLiteralElementLike = objLit.properties[i];
			if (prop.name.getText(sf) === propName && ts.isPropertyAssignment(prop)) {
				props.splice(i, 1);
				newObjLit = ts.updateObjectLiteral(
					newObjLit,
					props
				);
				break;
			}
		}
	}
	return newObjLit;
}
/**
 * Get a list of behaviors from the ClassDeclaration. PolymerTS defines these as behavior decorators
 * @param classDecl {ts.ClassDeclaration}
 * @param sf {ts.SourceFile}
 * @return {RedPill.IncludedBehavior[]}
 */
export function getComponentBehaviors(classDecl: ts.ClassDeclaration, sf: ts.SourceFile): RedPill.IncludedBehavior[] {
	let decorators = classDecl.decorators;
	let behaviors: RedPill.IncludedBehavior[] = [];
	if (decorators && decorators.length > 0) {
		for (let i = 0; i < decorators.length; i++) {
			let decorator = decorators[i];
			let decText = decorator.expression.getText(sf);
			let decTextMatchBehavior = polymerTsRegEx.behavior.exec(decText);
			if (decTextMatchBehavior && decTextMatchBehavior.length > 0) {
				let rpBehavior = new RedPill.IncludedBehavior();
				rpBehavior.sourceFile = sf;
				rpBehavior.decorator = decorator;
				behaviors.push(rpBehavior);
			}
		}
	}
	return behaviors;
}
/**
 * Determine if a decorator has an ObjectLiteral as an argument
 * @param decorator {ts.Decorator}
 * @return {boolean}
 */
export function decoratorHasObjectArgument(decorator: ts.Decorator): boolean {
	let hasObjectArg = false;
	if (decorator) {
		let callExp: ts.CallExpression = <ts.CallExpression> decorator.expression;
		let args = callExp.arguments;
		if (args && args.length > 0) {
			for (let i = 0; i < args.length; i++) {
				let arg = args[i];
				if (ts.isObjectLiteralExpression(arg)) {
					hasObjectArg = true;
				}
			}
		}

	}
	return hasObjectArg;
}
/**
 * If a decorator has an ObjectLiteral as an argument, get that argument and return it
 * @param decorator {ts.Decorator}
 * @return {ts.ObjectLiteralExpression}
 */
export function getDecoratorObjectArgument(decorator: ts.Decorator): ts.ObjectLiteralExpression {
	let obj: ts.ObjectLiteralExpression = null;
	if (decorator) {
		let callExp: ts.CallExpression = <ts.CallExpression> decorator.expression;
		let args = callExp.arguments;
		if (args && args.length > 0) {
			for (let i = 0; i < args.length; i++) {
				let arg = args[i];
				if (ts.isObjectLiteralExpression(arg)) {
					obj = <ts.ObjectLiteralExpression> arg;
					break;
				}
			}
		}
	}
	return obj;
}
/**
 * Determine if a decorator is for a PolymerTS component
 * @param decorator {ts.Decorator}
 * @param sf {ts.SourceFile}
 * @return {boolean}
 */
export function isComponentDecorator(decorator: ts.Decorator, sf: ts.SourceFile): boolean {
	let isComponent = false;
	if (decorator) {
		let decoratorText = decorator.getText(sf);
		let decTextMatch = polymerTsRegEx.component.exec(decoratorText);
		if (decTextMatch && decTextMatch.length > 0) {
			isComponent = true;
		}
	}
	return isComponent;
}
/**
 * Determine if a decorator is for a PolymerTS Computed Property
 * @param decorator {ts.Decorator}
 * @param sf {ts.SourceFile}
 * @return {boolean}
 */
export function isComputedDecorator(decorator: ts.Decorator, sf: ts.SourceFile): boolean {
	let isComputed = false;
	if (decorator) {
		let decoratorText = decorator.getText(sf);
		let decTextMatch = polymerTsRegEx.computed.exec(decoratorText);
		if (decTextMatch && decTextMatch.length > 0) {
			isComputed = true;
		}
	}
	return isComputed;
}
/**
 * Determine if a decorator is for a PolymerTS Observer
 * @param decorator {ts.Decorator}
 * @param sf {ts.SourceFile}
 * @return {boolean}
 */
export function isObserverDecorator(decorator: ts.Decorator, sf: ts.SourceFile): boolean {
	let isObserver = false;
	if (decorator) {
		let decoratorText = decorator.getText(sf);
		let decTextMatch = polymerTsRegEx.observe.exec(decoratorText);
		if (decTextMatch && decTextMatch.length > 0) {
			isObserver = true;
		}
	}
	return isObserver;
}
/**
 * Determine if a decorator is for a PolymerTS Behavior
 * @param decorator {ts.Decorator}
 * @param sf {ts.SourceFile}
 * @return {boolean}
 */
export function isBehaviorDecorator(decorator: ts.Decorator, sf: ts.SourceFile): boolean {
	let isBehavior = false;
	if (decorator) {
		let decoratorText = decorator.getText(sf);
		let decTextMatch = polymerTsRegEx.behavior.exec(decoratorText);
		if (decTextMatch && decTextMatch.length > 0) {
			isBehavior = true;
		}
	}
	return isBehavior;
}
/**
 * Determine if a decorator is a PolymerTS Listener
 * @param decorator {ts.Decorator}
 * @param sf {ts.SourceFile}
 * @return {boolean}
 */
export function isListenerDecorator(decorator: ts.Decorator, sf: ts.SourceFile): boolean {
	let isListener = false;
	if (decorator) {
		let decoratorText = decorator.getText(sf);
		let decTextMatch = polymerTsRegEx.listen.exec(decoratorText);
		if (decTextMatch && decTextMatch.length > 0) {
			isListener = true;
		}
	}
	return isListener;
}
/**
 * Determine if a decorator is a PolymerTS Property
 * @param decorator {ts.Decorator}
 * @param sf {ts.SourceFile}
 * @return {boolean}
 */
export function isPropertyDecorator(decorator: ts.Decorator, sf: ts.SourceFile): boolean {
	let isProperty = false;
	if (decorator) {
		let decoratorText = decorator.getText(sf);
		let decTextMatch = polymerTsRegEx.property.exec(decoratorText);
		if (decTextMatch && decTextMatch.length > 0) {
			isProperty = true;
		}
	}
	return isProperty;
}
/**
 * Get the PolymerTS decorator from a node. If there isn't a decorator that matches the regular
 * expressions in polymerTsRegEx return null
 * @param node {ts.Node}
 * @param sf {ts.SourceFile}
 * @return {ts.Decorator}
 */
export function getPolymerTsDecorator(node: ts.Node, sf: ts.SourceFile): ts.Decorator {
	let decorator: ts.Decorator = null;
	if (node) {
		let decorators: ts.NodeArray<ts.Decorator>;
		switch (node.kind) {
			case ts.SyntaxKind.MethodDeclaration:
				let methDecl: ts.MethodDeclaration = <ts.MethodDeclaration> node;
				decorators = methDecl.decorators;
				for (let i = 0; i < decorators.length; i++){
					let dec = decorators[i];
					if (isListenerDecorator(dec, sf) || isComputedDecorator(dec, sf) || isObserverDecorator(dec, sf)) {
						decorator = dec;
						break;
					}
				}
				break;
			case ts.SyntaxKind.ClassDeclaration:
				let classDecl: ts.ClassDeclaration = <ts.ClassDeclaration> node;
				decorators = classDecl.decorators;
				for (let i = 0; i < decorators.length; i++){
					let dec = decorators[i];
					if (isComponentDecorator(dec, sf)) {
						decorator = dec;
						break;
					}
				}
				break;
			case ts.SyntaxKind.PropertyDeclaration:
				let propDecl: ts.PropertyDeclaration = <ts.PropertyDeclaration> node;
				decorators = propDecl.decorators;
				for (let i = 0; i < decorators.length; i++){
					let dec = decorators[i];
					if (isPropertyDecorator(dec, sf)) {
						decorator = dec;
						break;
					}
				}
				break;
		}
	}
	return decorator;
}
/**
 * Create a JavaScript Object from an ObjectLiteralExpression
 * @param objLitExp {ts.ObjectLiteralExpression}
 * @param sf {ts.SourceFile}
 * @return {PropertyOptions}
 * @deprecated
 */
export function objectLiteralExpressionToObjectLiteral(objLitExp: ts.ObjectLiteralExpression, sf: ts.SourceFile): PropertyOptions {
	let opts: PropertyOptions = {};
	if (objLitExp && objLitExp.properties) {
		for (let i = 0; i < objLitExp.properties.length; i++) {
			let prop: ts.ObjectLiteralElementLike = <ts.PropertyAssignment> objLitExp.properties[i];
			let name = prop.name.getText(sf);
			opts[name] = prop.initializer.getText(sf);
		}
	}
	return opts;
}
/**
 * Determine if a PolymerTS Observer is a complex Observer. Meaning does it reference
 * a sub-property
 * @param decorator {ts.Decorator}
 * @param sf {ts.SourceFile}
 * @return {boolean}
 */
export function isComplexObserver(decorator: ts.Decorator, sf: ts.SourceFile): boolean {
	let isComplex = false;
	if (decorator) {
		let callExp: ts.CallExpression = <ts.CallExpression> decorator.expression;
		let args: ts.Expression[] = [].concat(callExp.arguments);
		for (let i = 0; i < args.length; i++) {
			let arg: ts.Expression = args[i];
			if (arg && ts.isStringLiteral) {
				let argStr: ts.StringLiteral = <ts.StringLiteral> arg;
				if (argStr.getText(sf).indexOf('.') > -1) {
					isComplex = true;
					break;
				}
			}
		}
	}
	return isComplex;
}
/**
 * Get the class name from a ClassDeclaration
 * @param classDecl {ts.ClassDeclaration}
 * @param sf {ts.SourceFile}
 * @return {string}
 */
export function getClassNameFromClassDeclaration(classDecl: ts.ClassDeclaration, sf: ts.SourceFile): string {
	let className = null;
	if (classDecl) {
		className = classDecl.name.getText(sf);
	}
	return className;
}
/**
 * Get the SINGLE heritage clause (i.e. `extends SomeOther.Element`). If the changeComponentClassExtension option
 * is true, then replace what the class extends with `Polymer.Element`
 * @param classDecl {ts.ClassDeclaration}
 * @param options {ConverterOptions}
 * @param sf {ts.SourceFile}
 * @return {ts.HeritageClause[]}
 */
export function getClassHeritageExtendsPolymer(classDecl: ts.ClassDeclaration, options: ConverterOptions, sf: ts.SourceFile): ts.HeritageClause[] {
	let newHeritages = [];
	if (classDecl) {
		let heritages = [].concat(classDecl.heritageClauses);
		if (heritages.length === 1) {
			let propAccessExp: ts.PropertyAccessExpression = null;
			if (options.changeComponentClassExtension) {
				propAccessExp = ts.createPropertyAccess(
					ts.createIdentifier('Polymer'),
					ts.createIdentifier('Element')
				);
			}else {
				let heritage: ts.HeritageClause = heritages[0];
				propAccessExp = <ts.PropertyAccessExpression> heritage.types[0].expression;
			}
			let expWithArgs = ts.createExpressionWithTypeArguments(
				[],
				propAccessExp
			);
			let newHeritage = ts.updateHeritageClause(
				heritages[0],
				[expWithArgs]
			);
			newHeritages.push(newHeritage);
		}else { // may include `implements`
			// TODO:
		}
	}
	return newHeritages;
}

