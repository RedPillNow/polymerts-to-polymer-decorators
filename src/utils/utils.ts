import * as ts from 'typescript';
import {RedPill} from 'polymerts-models';
import {TransformChangeType, RefNodeCreateChangeRecord, PropertyOptions} from './custom-types';

export const polymerTsRegEx = {
	component: /(component\s*\((?:['"]{1}(.*)['"]{1})\))/,
	extend: null,
	property: /(property\s*\(({[a-zA-Z0-9:,\s]*})\)\s*([\w\W]*);)/,
	observe: /(observe\(([a-zA-Z0-9:,\s'".]*)?\))/,
	computed: /(computed\(({[a-zA-Z0-9:,\s]*})?\))/,
	listen: /(listen\(([\w.\-'"]*)\))/,
	behavior: /(behavior\s*\((...*)\))/,
	hostAttributes: null
};

export function getArgsFromNode(paramsFromNode: ts.Decorator|ts.MethodDeclaration, sf: ts.SourceFile) {
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

export function updateDecorator(existingDecorator: ts.Decorator, decoratorName: string, params: ts.StringLiteral[], sf: ts.SourceFile) {
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

export function renameDecorator(parentNode: ts.Node, polymerTsRegEx: RegExp, newDecoratorText: string, sf: ts.SourceFile) {
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

export function updateMethodDecorator(methodDecl: ts.MethodDeclaration, newDecorators: ts.Decorator[]) {
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

export function addPropertyToPropertyDecl(property: ts.PropertyDeclaration, newPropName: string, newPropInitializer: string, sf: ts.SourceFile): ts.PropertyDeclaration {
	let updatedProp = null;
	if (property) {
		let existingPropDec = property.decorators[0];
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
			/* ts.PropertyDeclaration */ property,
			/* ts.Decorator[] */ [newDecorator],
			/* ts.Modifier[] */ property.modifiers,
			/* string|ts.Identifier */ property.name,
			/* ts.Token<QuestionToken|ExclamationToken> */ property.questionToken,
			/* ts.TypeNode */ property.type,
			/* ts.Expression initializer */ property.initializer
		);
	}
	return updatedProp;
}

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

export function getComponentBehaviors(classDecl: ts.ClassDeclaration, sf: ts.SourceFile) {
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

export function addRefNodeChangeRecord(origNode: ts.Node, newNode: ts.Node, refPath: string) {
	let refNodeChg: RefNodeCreateChangeRecord = {
		changeType: TransformChangeType.AddTSReferenceTag,
		origNode: origNode,
		newNode: newNode,
		refNodePath: refPath
	};
	this._changeRecords.push(refNodeChg);
}

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
