import * as ts from 'typescript';
import {RedPill} from 'polymerts-models';
import {TransformChangeType, RefNodeCreateChangeRecord, PropertyOptions} from './custom-types';

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
 * Update a decorator with a new name and/or parameters
 * @param existingDecorator {ts.Decorator} decorator to update
 * @param decoratorName {string} new decorator name
 * @param params {ts.Expression[]} new parameters to add to the decorator
 * @param sf {ts.SourceFile}
 * @return {ts.Decorator}
 * @todo decorator name and params should be able to be null, then we just update the
 * CallExpression. This would negate renameDecorator
 */
export function updateDecorator(existingDecorator: ts.Decorator, decoratorName: string, params: ts.Expression[], sf: ts.SourceFile): ts.Decorator {
	let newDecorator: ts.Decorator = null;
	if (decoratorName && existingDecorator) {
		const newIdent = ts.createIdentifier(decoratorName);
		const newArgs: ts.StringLiteral[] = getArgsFromNode(existingDecorator, sf);
		let newCallExp = ts.createCall(
			/* ts.Expression */ newIdent,
			/* ts.TypeNode[] */ (<ts.CallExpression> existingDecorator.expression).typeArguments,
			/* ts.Expression[] */ params || newArgs
		);
		newDecorator = ts.updateDecorator(
			/* ts.Decorator */ existingDecorator,
			/* ts.CallExpression */ newCallExp
		);
	}
	return newDecorator;
}
/**
 *
 * @param parentNode {ts.Node} decorator's parent node
 * @param polymerTsRegEx {RegExp}
 * @param newDecoratorText {string}
 * @param sf {ts.SourceFile}
 * @return ts.Decorator
 * @todo instead of creating a new CallExpression, maybe we should update the
 * existing CallExpression
 */
export function renameDecorator(parentNode: ts.Node, polymerTsRegEx: RegExp, newDecoratorText: string, sf: ts.SourceFile): ts.Decorator {
	let decorators = parentNode.decorators;
	let newDecorator: ts.Decorator = null;
	for (let i = 0; i < decorators.length; i++) {
		let dec: ts.Decorator = <ts.Decorator> decorators[i];
		let decText = dec.expression.getText(sf);
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
/**
 * Update a MethodDeclaration with new decorators
 * @param methodDecl {ts.MethodDeclaration} the method to update
 * @param newDecorators {ts.Decorator[]} the new decorators to add
 * @return {ts.MethodDeclaration}
 * @todo this seems kind-of extremely simple... what does it save us?
 */
export function updateMethodDecorator(methodDecl: ts.MethodDeclaration, newDecorators: ts.Decorator[]): ts.MethodDeclaration {
	return ts.updateMethod(
		methodDecl,
		newDecorators,
		methodDecl.modifiers,
		methodDecl.asteriskToken,
		methodDecl.name,
		methodDecl.questionToken,
		methodDecl.typeParameters,
		methodDecl.parameters,
		methodDecl.type,
		methodDecl.body
	);
}
/**
 * Add a property to a property decorator argument
 * @param propDecl {ts.PropertyDeclaration} the property to update
 * @param newPropName {string} new name for a property
 * @param newPropInitializer {string} new property initialiazer
 * @param sf {ts.SourceFile}
 * @return {ts.PropertyDeclaration}
 */
export function addPropertyToPropertyDecl(propDecl: ts.PropertyDeclaration, newPropName: string, newPropInitializer: string, sf: ts.SourceFile): ts.PropertyDeclaration {
	let updatedProp = null;
	if (propDecl) {
		let existingPropDec = propDecl.decorators[0];
		/* if (!existingPropDec) {
			existingPropDec = property.decorators[0];
		} */
		let objLit = (<ts.ObjectLiteralExpression> (<ts.CallExpression> existingPropDec.expression).arguments[0])
		let propProps = [];
		for (let i = 0; i < objLit.properties.length; i++) {
			let propProp = objLit.properties[i];
			propProps.push(propProp);
		}
		let newPropProp = ts.createPropertyAssignment(
			/* string|ts.Identifier */ newPropName,
			/* ts.Expression initializer */ ts.createStringLiteral(newPropInitializer)
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
		updatedProp = ts.updateProperty(
			/* ts.PropertyDeclaration */ propDecl,
			/* ts.Decorator[] */ [newDecorator],
			/* ts.Modifier[] */ propDecl.modifiers,
			/* string|ts.Identifier */ propDecl.name,
			/* ts.Token<QuestionToken|ExclamationToken> */ propDecl.questionToken,
			/* ts.TypeNode */ propDecl.type,
			/* ts.Expression initializer */ propDecl.initializer
		);
	}
	return updatedProp;
}
/**
 * Remove a property from a property decorator argument
 * @param propDecl {ts.PropertyDeclaration}
 * @param propertyName {string} the property name to remove
 * @param sf {ts.SourceFile}
 * @return {ts.PropertyDeclaration}
 */
export function removePropertyFromPropertyDecl(propDecl: ts.PropertyDeclaration, propertyName: string, sf: ts.SourceFile): ts.PropertyDeclaration {
	let newProp = propDecl;
	if (propDecl) {
		let existingPropDec = getPolymerTsDecorator(propDecl, sf);
		if (!existingPropDec) {
			existingPropDec = propDecl.decorators[0];
		}
		let objLit = (<ts.ObjectLiteralExpression> (<ts.CallExpression> existingPropDec.expression).arguments[0])
		let propProps = [];
		for (let i = 0; i < objLit.properties.length; i++) {
			let propProp: ts.ObjectLiteralElementLike = objLit.properties[i];
			if (propProp.name.getText(sf) !== propertyName) {
				propProps.push(propProp);
			}
		}
		let newObjLit = ts.updateObjectLiteral(
			/* ts.ObjectLiteralExpression */ objLit,
			/* ts.ObjectLiteralElementLike */ propProps
		);
		let newIdent = ts.createIdentifier('property');
		let newArgs = [newObjLit];
		let newCallExp = ts.createCall(
			newIdent,
			undefined,
			newArgs
		);
		let newDecorator = ts.createDecorator(newCallExp);
		newProp = ts.updateProperty(
			/* ts.PropertyDeclaration */ propDecl,
			/* ts.Decorator[] */ [newDecorator],
			/* ts.Modifier[] */ propDecl.modifiers,
			/* string|ts.Identifier */ propDecl.name,
			/* ts.Token<QuestionToken|ExclamationToken> */ propDecl.questionToken,
			/* ts.TypeNode */ propDecl.type,
			/* ts.Expression initializer */ propDecl.initializer
		);
	}
	return newProp;
}
/**
 * Add an initializer to a property decorator
 * @param propDecl {ts.PropertyDeclaration}
 * @param initializer {ts.Expression}
 * @return {ts.PropertyDeclaration}
 */
export function addInitializerToPropertyDecl(propDecl: ts.PropertyDeclaration, initializer: ts.Expression): ts.PropertyDeclaration {
	let newProp = propDecl;
	if (propDecl) {
		newProp = ts.updateProperty(
			/* ts.PropertyDeclaration */ propDecl,
			/* ts.Decorator[] */ propDecl.decorators,
			/* ts.Modifier[] */ propDecl.modifiers,
			/* ts.Identifier */ propDecl.name,
			/* ts.QuestionToken */ propDecl.questionToken,
			/* ts.typeNode */ propDecl.type,
			/* ts.Expression init */ initializer
		)
	}
	return newProp;
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
		for (let i = 0; i < objLit.properties.length; i++) {
			let propProp: ts.ObjectLiteralElementLike = objLit.properties[i];
			if (propProp.name.getText(sf) === 'value' && ts.isPropertyAssignment(propProp)) {
				let propPropAssign: ts.PropertyAssignment = <ts.PropertyAssignment> propProp;
				valueExp = propPropAssign.initializer;
				break;
			}
		}
	}
	return valueExp;
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
 *
 * @param origNode
 * @param newNode
 * @param refPath
 * @deprecated
 */
export function addRefNodeChangeRecord(origNode: ts.Node, newNode: ts.Node, refPath: string) {
	let refNodeChg: RefNodeCreateChangeRecord = {
		changeType: TransformChangeType.AddTSReferenceTag,
		origNode: origNode,
		newNode: newNode,
		refNodePath: refPath
	};
	this._changeRecords.push(refNodeChg);
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
 * Create a new property with decorator
 * @param objExp {ts.ObjectLiteralExpression}
 * @param propertyName {string}
 * @param sf {ts.SourceFile}
 * @return {ts.PropertyDeclaration}
 * @deprecated
 */
export function createProperty(objExp: ts.ObjectLiteralExpression, propertyName: string, sf: ts.SourceFile): ts.PropertyDeclaration {
	let ident: ts.Identifier = ts.createIdentifier('property');
	let callExp: ts.CallExpression = ts.createCall(
		/* ts.Expression */ ident,
		/* ts.TypeNode[] */ undefined,
		/* ts.Expression[] arguments*/ [objExp]
	);
	let newDecorator: ts.Decorator = ts.createDecorator(/* ts.Expression */ callExp);
	let objLit = objectLiteralExpressionToObjectLiteral(objExp, sf);
	let objLitType = objLit.type;
	let typeRefIdent = null;
	if (objLitType === 'String') {
		typeRefIdent = 'string';
	}else if (objLitType === 'Number') {
		typeRefIdent = 'number';
	}else {
		typeRefIdent = 'any';
	}

	let typeRef: ts.TypeReferenceNode = ts.createTypeReferenceNode(
		/* ts.Identifier */ typeRefIdent,
		/* ts.TypeNode[] */ undefined
	);
	let newProp: ts.PropertyDeclaration = ts.createProperty(
		/* ts.Decorator[] */ [newDecorator],
		/* ts.Modifier[] */ undefined,
		/* string */ propertyName,
		/* ts.Token<QuestionToken> */ undefined,
		/* ts.TypeNode */ typeRef,
		/* ts.Expression initializer */ undefined
	);
	return newProp;
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
