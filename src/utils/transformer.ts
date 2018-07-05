import * as ts from 'typescript';
import * as chalk from './chalkConfig';
import {RedPill} from 'polymerts-models';
import {TransformChangeRecord, TransformChangeType, ConverterOptions, PropertyAddPropertyChangeRecord, PropertyCreateChangeRecord, ListenerAddToReadyChangeRecord, RefNodeCreateChangeRecord, MethodRenameChangeRecord, NotificationType, Notification} from './custom-types';
import * as transformUtils from './utils';
import { Transform } from 'stream';

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

	preTransform(ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
		console.log(chalk.processing('Analyzing source file for required changes...'));
		let preSource = ts.createSourceFile(this._sourceFile.fileName, this._sourceFile.getText(), this._sourceFile.languageVersion);
		let preTransform: ts.Transformer<ts.SourceFile> = this._transformer.getTransformNodes.apply(this._transformer, [ctx, preSource]);
		return preTransform;
	}

	transform(ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
		ts.transform(this._sourceFile, [this.preTransform.bind(this)]);
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
	private _addNodes: TransformChangeRecord[] = [];
	private _notifications: Notification[] = [];

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

	get notifications() {
		return this._notifications;
	}

	getTransformNodes(ctx: ts.TransformationContext, sf: ts.SourceFile): ts.Transformer<ts.SourceFile> {
		this._sourceFile = sf;
		this._ctx = ctx;
		const preVisitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			node = ts.visitEachChild(node, preVisitor, ctx);
			switch (node.kind) {
				case ts.SyntaxKind.ClassDeclaration:
					let classDecl = ts.isClassDeclaration(node) ? node as ts.ClassDeclaration : null;
					if (classDecl && RedPill.isComponent(classDecl, sf)) {
						let comp = new RedPill.Component(classDecl);
						comp.sourceFile = sf;
						let classChgRec = this.transformClassDecl(classDecl);
						this._transformNodeMap.set(classDecl, classChgRec);
					}
					break;
				case ts.SyntaxKind.ModuleDeclaration:
					break;
				case ts.SyntaxKind.MethodDeclaration:
					let methodDeclNode = ts.isMethodDeclaration(node) ? node as ts.MethodDeclaration : null;
					if (methodDeclNode && RedPill.isComputedProperty(methodDeclNode, sf)) {
						let chgRec = this.transformComputedProp(methodDeclNode);
						this._transformNodeMap.set(methodDeclNode, chgRec);
					}else if (methodDeclNode && RedPill.isListener(methodDeclNode, sf)) {
						let chgRec = this.transformListener(methodDeclNode);
						this._transformNodeMap.set(methodDeclNode, chgRec);
					}else if (methodDeclNode && RedPill.isObserver(methodDeclNode, sf)) {
						let chgRec: TransformChangeRecord = this.transformObserver(methodDeclNode);
						this._transformNodeMap.set(methodDeclNode, chgRec);
					}else {
						let methodName = methodDeclNode.name.getText(this._sourceFile);
						if (methodName === 'ready') {
							if (!this._options.applyDeclarativeEventListenersMixin && !this._options.applyGestureEventListenersMixin) {
								let chgRec: TransformChangeRecord = {
									origNode: methodDeclNode,
									changeType: TransformChangeType.MethodModify
								};
								this._transformNodeMap.set(methodDeclNode, chgRec);
							}
						}
					}
					break;
				case ts.SyntaxKind.PropertyDeclaration:
					let propDeclNode = ts.isPropertyDeclaration(node) ? node as ts.PropertyDeclaration : null;
					if (propDeclNode && RedPill.isDeclaredProperty(propDeclNode)) {
						let chgRec: TransformChangeRecord = this.transformProperty(propDeclNode);
						this._transformNodeMap.set(propDeclNode, chgRec);
					}
					break;
				default:
					// do nothing
			}
			return node;
		}
		return (rootNode): ts.SourceFile => {
			return ts.visitNode(rootNode, preVisitor);
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
			node = ts.visitEachChild(node, visitor, ctx);
			let transformChgRec = this._transformNodeMap.get(node);
			if (transformChgRec) {
				let newNode = transformChgRec.newNode;
				if (newNode && newNode.kind === node.kind) {
					if (transformChgRec.notification && transformChgRec.notification.type === NotificationType.INFO) {
						console.log(chalk.processing(transformChgRec.notification.msg));
					}else if (transformChgRec.notification && transformChgRec.notification.type === NotificationType.WARN) {
						console.log(chalk.warn(transformChgRec.notification.msg));
					}else if (transformChgRec.notification && transformChgRec.notification.type === NotificationType.ERROR) {
						console.log(chalk.error(transformChgRec.notification.msg));
					}else {
						console.log(chalk.processing('Transforming ' + ts.SyntaxKind[newNode.kind]));
					}
					return newNode;
				}else if (newNode && newNode.kind !== node.kind) {
					if (transformChgRec.changeType === TransformChangeType.MethodReplace) {
						return newNode;
					}else {
						console.log(chalk.warn('Seems we need to replace a node'));
					}
				}
			}else {
				let notify: Notification = {
					type: NotificationType.ERROR,
					msg: 'No Transform record found for node ' + node.getText(this._sourceFile)
				};
				this._notifications.push(notify);
			}
			return node;
		}
		return (rootNode): ts.SourceFile => {
			return ts.visitNode(rootNode, visitor);
		}
	}

	transformClassDecl(classDecl: ts.ClassDeclaration): TransformChangeRecord {
		let newClassDecl: ts.ClassDeclaration = null;
		let chgRec: TransformChangeRecord = null;
		if (classDecl && ts.isClassDeclaration(classDecl)) {
			let newDecorator = transformUtils.renameDecorator(classDecl, transformUtils.polymerTsRegEx.component, 'customElement', this._sourceFile);
			let decorators = classDecl.decorators;
			if (newDecorator && decorators && decorators.length > 0) {
				let behaviors: RedPill.IncludedBehavior[] = transformUtils.getComponentBehaviors(classDecl, this._sourceFile);
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
		return chgRec;
	}

	transformComputedProp(methodDecl: ts.MethodDeclaration): TransformChangeRecord {
		let chgRec: TransformChangeRecord = null;
		if (methodDecl && ts.isMethodDeclaration(methodDecl)) {
			let methodName = methodDecl.name.getText(this._sourceFile);
			let notify: Notification =  {
				type: NotificationType.INFO,
				msg: 'Replaced the ' + methodName + ' with a getter.'
			};
			let decorator: ts.Decorator = transformUtils.getPolymerTsDecorator(methodDecl, this._sourceFile);
			let newDecorators: ts.Decorator[] = [];
			if (decorator) {
				let rpCompProp = new RedPill.ComputedProperty(methodDecl);
				rpCompProp.sourceFile = this._sourceFile;
				if (transformUtils.decoratorHasObjectArgument(decorator)) { // @computed({type: String})
					let callExp: ts.CallExpression = <ts.CallExpression> decorator.expression;
					let objLitExp: ts.ObjectLiteralExpression = <ts.ObjectLiteralExpression> callExp.arguments[0];
					let newCallExp: ts.CallExpression = ts.createCall(
						/* ts.Expression */ ts.createIdentifier('property'),
						/* ts.TypeNode */ undefined,
						/* args ts.Expression[] */ [objLitExp]
					);
					let newPropertyDecorator: ts.Decorator = ts.createDecorator(
						/* ts.Expression */ newCallExp
					);
					newDecorators.push(newPropertyDecorator);
					notify.msg += ' Added a property decorator';
				}
				let newArgs: ts.StringLiteral[] = transformUtils.getArgsFromNode(methodDecl, this._sourceFile);
				let updatedDecorator = transformUtils.updateDecorator(decorator, 'computed', newArgs, this._sourceFile);
				newDecorators.push(updatedDecorator);
				let propertyName: ts.Identifier = <ts.Identifier> methodDecl.name;
				// TODO: Need to parse the body looking for property names and change them to use `this.propertyName`
				let newGetter: ts.GetAccessorDeclaration = ts.createGetAccessor(
					/* ts.Decorator[] */ newDecorators,
					/* ts.Modifier[] */ undefined,
					/* ts.Identifier|ts.StringLiteral */ propertyName,
					/* ts.ParameterDeclaration[] */ undefined,
					/* ts.TypeNode */ undefined,
					/* ts.Block */ methodDecl.body
				);
				let replaceMeth: TransformChangeRecord = {
					changeType: TransformChangeType.MethodReplace,
					origNode: methodDecl,
					newNode: newGetter,
					notification: notify
				}
				chgRec = replaceMeth;
				this._notifications.push(notify);
			}
		}
		return chgRec;
	}

	transformListener(methodDecl: ts.MethodDeclaration): TransformChangeRecord {
		let chgRec: TransformChangeRecord = null;
		if (methodDecl && ts.isMethodDeclaration(methodDecl)) {
			let decorator = transformUtils.getPolymerTsDecorator(methodDecl, this._sourceFile);
			if (decorator && transformUtils.isListenerDecorator(decorator, this._sourceFile)) {
				let classDecl: TransformChangeRecord = this._findExistingClassDeclaration();
				if (this.options.applyDeclarativeEventListenersMixin) {
					let rpListener = new RedPill.Listener(methodDecl);
					rpListener.sourceFile = this._sourceFile;
					let params: ts.StringLiteral[] = [];
					params.push(ts.createStringLiteral(rpListener.eventName));
					params.push(ts.createStringLiteral(rpListener.elementId));
					/* let newDecorator: ts.Decorator = transformUtils.updateDecorator(decorator, 'listen', params, this._sourceFile);
					let newMethod = ts.updateMethod(
						methodDecl,
						[newDecorator],
						methodDecl.modifiers,
						methodDecl.asteriskToken,
						methodDecl.name,
						methodDecl.questionToken,
						methodDecl.typeParameters,
						methodDecl.parameters,
						methodDecl.type,
						methodDecl.body
					);
					let notification: Notification = {
						type: NotificationType.INFO,
						msg: 'Updated decorator for ' + rpListener.methodName
					};
					this._notifications.push(notification);
					chgRec = {
						changeType: TransformChangeType.MethodModify,
						origNode: methodDecl,
						newNode: newMethod,
						notification: notification,
						polymerTsModel: rpListener
					}; */
					// TODO: Need to add 2 arguments to the decorator
				}else {
					let readyMethod = this._findReadyMethod();
					let listenerChgRec: ListenerAddToReadyChangeRecord = {
						changeType: TransformChangeType.ListenerAddToReady,
						origNode: readyMethod,
						listenerMethod: methodDecl,
						createReadyMethod: readyMethod ? false : true,
						eventName: null,
						eventTarget: null
					}
					chgRec = listenerChgRec;
				}
			}
		}
		return chgRec;
	}

	transformObserver(methodDecl: ts.MethodDeclaration): TransformChangeRecord {
		let chgRec: TransformChangeRecord = null;
		if (methodDecl && ts.isMethodDeclaration(methodDecl)) {
			let decorator:ts.Decorator = transformUtils.getPolymerTsDecorator(methodDecl, this._sourceFile);
			let methodName = methodDecl.name.getText(this._sourceFile);
			if (decorator && transformUtils.isObserverDecorator(decorator, this._sourceFile)) {
				let callExp: ts.CallExpression = <ts.CallExpression> decorator.expression;
				let rpObserver = new RedPill.Observer(methodDecl);
				rpObserver.sourceFile = this._sourceFile;
				let notify: Notification = null;
				let newDecorators = [];
				let moveSingles = this.options.moveSinglePropertyObserversToProperty;
				let isComplex = transformUtils.isComplexObserver(decorator, this._sourceFile);
				if (rpObserver.params && rpObserver.params.length === 1 && moveSingles && !isComplex) {
					let argName = callExp.arguments[0].getText(this._sourceFile);
					argName = argName ? argName.replace(/[\'"]*/g, '') : argName;
					const existPropChgRec: TransformChangeRecord = this._findExistingDeclaredProperty(argName);
					if (existPropChgRec && existPropChgRec.newNode) {
						let existingProp = existPropChgRec.newNode ? <ts.PropertyDeclaration> existPropChgRec.newNode : null;
						if (existingProp) {
							existingProp = transformUtils.addPropertyToPropertyDecl(existingProp, 'observer', methodName, this._sourceFile);
							existPropChgRec.newNode = existingProp;
							this._transformNodeMap.set(existPropChgRec.origNode, existPropChgRec);
							notify = {
								type: NotificationType.INFO,
								msg: 'Moved the observer for ' + argName + ' to it\'s relevant property'
							}
						}else {
							notify = {
								type: NotificationType.ERROR,
								msg: 'Found a change record for ' + argName + ' but no new node was defined'
							};
						}
					}else {
						notify = {
							type: NotificationType.ERROR,
							msg: 'Found a change record for property ' + argName + ', no new node was defined transforming observer ' + rpObserver.methodName + '!'
						};
					}
				}else if (rpObserver.params && (rpObserver.params.length > 1 || isComplex)) {
					let params: ts.StringLiteral[] = [];
					for (let i = 0; i < rpObserver.params.length; i++) {
						let param: ts.StringLiteral = ts.createStringLiteral(rpObserver.params[i])
						params.push(param);
					}
					let newDecorator: ts.Decorator = transformUtils.updateDecorator(decorator, 'observe', params, this._sourceFile);
					newDecorators.push(newDecorator);
					notify = {
						type: NotificationType.INFO,
						msg: 'Updated the observe decorator for the ' + rpObserver.methodName + ' method'
					}
				}
				let newMethod = ts.updateMethod(
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
				)
				chgRec = {
					changeType: TransformChangeType.MethodModify,
					origNode: methodDecl,
					newNode: newMethod,
					notification: notify
				};
				this._notifications.push(notify);
			}
		}
		return chgRec;
	}

	transformProperty(propertyDecl: ts.PropertyDeclaration): TransformChangeRecord {
		let chgRec: TransformChangeRecord = null;
		if (propertyDecl && ts.isPropertyDeclaration(propertyDecl)) {
			let rpProp = new RedPill.Property(propertyDecl);
			rpProp.sourceFile = this._sourceFile;
			let notify: Notification = null;
			chgRec = {
				changeType: TransformChangeType.PropertyAddValueInitializer,
				origNode: propertyDecl,
				newNode: null,
			};
			if (rpProp.containsValueArrayLiteral || rpProp.containsValueFunction || rpProp.containsValueObjectDeclaration || rpProp.containsValueBoolean || rpProp.containsValueStringLiteral) {
				let valueInit = transformUtils.getPropertyValueExpression(propertyDecl, this._sourceFile);
				let propDelValue = transformUtils.removePropertyFromPropertyDecl(propertyDecl, 'value', this._sourceFile);
				notify = {
					type: NotificationType.INFO,
					msg: 'Property ' + rpProp.name + ' has a value defined. Moved initializer to property instead of decorator'
				};
				chgRec.notification = notify;
				let propWithInitializer = transformUtils.addInitializerToPropertyDecl(propDelValue, valueInit);
				chgRec.newNode = propWithInitializer;
			}else {
				notify = {
					type: NotificationType.INFO,
					msg: 'No modifications required for declared property ' + rpProp.name
				}
				chgRec = {
					changeType: TransformChangeType.PropertyModify,
					origNode: propertyDecl,
					newNode: propertyDecl,
					notification: notify
				};
			}
			this._notifications.push(notify);
		}
		return chgRec;
	}

	_findExistingDeclaredProperty(propertyName: string): TransformChangeRecord {
		let existingProp = null;
		this._transformNodeMap.forEach((val: TransformChangeRecord, key: ts.Node, map: Map<ts.Node, TransformChangeRecord>) => {
			if (ts.isPropertyDeclaration(key) && RedPill.isDeclaredProperty(key)) {
				let rpProp = new RedPill.Property(key);
				rpProp.sourceFile = this._sourceFile;
				let name = rpProp.name;
				if (name === propertyName) {
					existingProp = val
				}
			}
		});
		return existingProp;
	}

	_findExistingClassDeclaration() {
		let existingClass = null;
		this._transformNodeMap.forEach((val: TransformChangeRecord, key: ts.Node, map: Map<ts.Node, TransformChangeRecord>) => {
			if (ts.isClassDeclaration(key) && RedPill.isComponent(key, this._sourceFile)) {
				existingClass = val;
			}
		});
		return existingClass;
	}

	_findReadyMethod() {
		let readyMeth = null;
		this._transformNodeMap.forEach((val: TransformChangeRecord, key: ts.Node, map: Map<ts.Node, TransformChangeRecord>) => {
			if (ts.isMethodDeclaration(key)) {
				let methodName = key.name.getText(this._sourceFile);
				if (methodName === 'ready') {
					readyMeth = val;
				}
			}
		});
		return readyMeth;
	}
}
