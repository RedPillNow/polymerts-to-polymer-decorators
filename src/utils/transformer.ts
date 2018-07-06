import * as ts from 'typescript';
import * as chalk from './chalkConfig';
import {RedPill} from 'polymerts-models';
import {TransformChangeRecord, TransformChangeType, ConverterOptions, ListenerAddToReadyChangeRecord, NotificationType, Notification} from './custom-types';
import * as transformUtils from './utils';

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

	get transformer() {
		return this._transformer;
	}

	preTransform(ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
		console.log(chalk.processing('Analyzing source file for required changes...'));
		let preSource = ts.createSourceFile(this._sourceFile.fileName, this._sourceFile.getText(), this._sourceFile.languageVersion);
		let preTransform: ts.Transformer<ts.SourceFile> = this._transformer.preTransform.apply(this._transformer, [ctx, preSource]);
		return preTransform;
	}

	transform(ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
		let preTransform: ts.TransformationResult<ts.SourceFile> = ts.transform(this._sourceFile, [this.preTransform.bind(this)]);
		let transformer: ts.Transformer<ts.SourceFile> = this._transformer.transform.apply(this._transformer, [ctx, this._sourceFile]);
		return transformer;
	}
}

export class PolymerTsTransformer {
	private _ctx: ts.TransformationContext;
	private _sourceFile: ts.SourceFile;
	private _options: ConverterOptions;
	private _transformNodeMap: Map<ts.Node, TransformChangeRecord> = new Map();
	private _addNodes: TransformChangeRecord[] = [];
	private _notifications: Notification[] = [];

	constructor(options: ConverterOptions) {
		this._options = options;
	}
	/**
	 * The transfomation context
	 * @type {ts.TransformationContext}
	 */
	get ctx() {
		return this._ctx;
	}

	set ctx(ctx: ts.TransformationContext) {
		this._ctx = ctx;
	}
	/**
	 * Log a message to the console
	 * @param msg {string}
	 */
	notifyUser(msg) {
		console.log(msg);
	}
	/**
	 * Options
	 * @type {ConverterOptions}
	 */
	get options() {
		return this._options;
	}

	set options(options) {
		this._options = options;
	}
	/**
	 * List of notifications
	 * @type {Notification[]}
	 */
	get notifications() {
		return this._notifications;
	}
	/**
	 * A map of nodes that was populated during preTransform
	 * @type {Map<ts.Node, TransformChangeRecord>}
	 */
	get transformNodeMap() {
		return this._transformNodeMap;
	}
	/**
	 * Use the visitor pattern to walk each node. If that node has a polymerTS decorator, make the necessary
	 * changes to the node to match the polymer-decorators pattern. This will create a TransformChangeRecord
	 * that will subsequently be placed in the _transformNodeMap
	 * @param ctx
	 * @param sf
	 * @see {TransformChangeRecord}
	 */
	preTransform(ctx: ts.TransformationContext, sf: ts.SourceFile): ts.Transformer<ts.SourceFile> {
		this._sourceFile = sf;
		this._ctx = ctx;
		const preVisitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			node = ts.visitEachChild(node, preVisitor, ctx);
			switch (node.kind) {
				case ts.SyntaxKind.ClassDeclaration:
					let classDecl = ts.isClassDeclaration(node) ? node as ts.ClassDeclaration : null;
					if (classDecl && RedPill.isComponent(classDecl, sf)) {
						let chgRec = this.transformClassDecl(classDecl);
						if (chgRec) {
							this._transformNodeMap.set(classDecl, chgRec);
						}
					}
					break;
				case ts.SyntaxKind.MethodDeclaration:
					let methodDeclNode = ts.isMethodDeclaration(node) ? node as ts.MethodDeclaration : null;
					if (methodDeclNode && RedPill.isComputedProperty(methodDeclNode, sf)) {
						let chgRec = this.transformComputedProp(methodDeclNode);
						if (chgRec) {
							this._transformNodeMap.set(methodDeclNode, chgRec);
						}
					}else if (methodDeclNode && RedPill.isListener(methodDeclNode, sf)) {
						let chgRec = this.transformListener(methodDeclNode);
						if (chgRec) {
							this._transformNodeMap.set(methodDeclNode, chgRec);
						}
					}else if (methodDeclNode && RedPill.isObserver(methodDeclNode, sf)) {
						let chgRec: TransformChangeRecord = this.transformObserver(methodDeclNode);
						if (chgRec) {
							this._transformNodeMap.set(methodDeclNode, chgRec);
						}
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
						if (chgRec) {
							this._transformNodeMap.set(propDeclNode, chgRec);
						}
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
	 * Use the visitor pattern to walk each node, if that node is in the transformNodeMap and it has a newNode
	 * defined, then return that newNode
	 * @param ctx {ts.TransformationContext}
	 * @returns {tx.Transformer<ts.SourceFile>}
	 */
	transform(ctx: ts.TransformationContext, sf: ts.SourceFile): ts.Transformer<ts.SourceFile> {
		this._sourceFile = sf;
		this._ctx = ctx;
		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			node = ts.visitEachChild(node, visitor, ctx);
			if (ts.isClassDeclaration(node)) {
				console.log(chalk.processing('*******Looking for a ' + ts.SyntaxKind[node.kind] + '*******'));
			}else {
				console.log(chalk.processing('Looking for a ' + ts.SyntaxKind[node.kind]));
			}
			let transformChgRec = this._transformNodeMap.get(node);
			if (transformChgRec) {
				console.log(chalk.processing('Found a change record for ' + ts.SyntaxKind[node.kind]));
				let newNode = transformChgRec.newNode;
				if (newNode && newNode.kind === node.kind) {
					if (transformChgRec.notification && transformChgRec.notification.type === NotificationType.INFO) {
						console.log(chalk.processing(transformChgRec.notification.msg));
					}else if (transformChgRec.notification && transformChgRec.notification.type === NotificationType.WARN) {
						console.log(chalk.warning(transformChgRec.notification.msg));
					}else if (transformChgRec.notification && transformChgRec.notification.type === NotificationType.ERROR) {
						console.log(chalk.error(transformChgRec.notification.msg));
					}else {
						console.log(chalk.processing('Transforming ' + ts.SyntaxKind[newNode.kind]));
					}
					return newNode;
				}else if (newNode && newNode.kind !== node.kind) {
					if (transformChgRec.changeType === TransformChangeType.MethodReplace) {
						console.log(chalk.processing(transformChgRec.notification.msg));
						return newNode;
					}else {
						let warn = chalk.warning('Seems we need to replace a node: ' + node.getText(this._sourceFile));
						console.log(warn);
					}
				}else {
					let warn = chalk.warning('Found a change record for \n' + node.getText(this._sourceFile) + '\n but no newNode was defined');
					console.log(warn);
				}
			}
			return node;
		}
		return (rootNode): ts.SourceFile => {
			return ts.visitNode(rootNode, visitor);
		}
	}
	/**
	 * Transform the class declaration statement
	 * @param classDecl {ts.ClassDeclaration}
	 * @return {TransformChangeRecord}
	 */
	transformClassDecl(classDecl: ts.ClassDeclaration): TransformChangeRecord {
		let chgRec: TransformChangeRecord = null;
		if (classDecl && ts.isClassDeclaration(classDecl)) {
			let newDecorator: ts.Decorator = transformUtils.renameDecorator(classDecl, transformUtils.polymerTsRegEx.component, 'customElement', this._sourceFile);
			if (newDecorator) {
				let notify: Notification = {
					type: NotificationType.INFO,
					msg: 'Updated the class statement decorator'
				};
				let behaviors: RedPill.IncludedBehavior[] = transformUtils.getComponentBehaviors(classDecl, this._sourceFile);

				let heritages: ts.HeritageClause[] = [].concat(classDecl.heritageClauses);
				let newHeritages: ts.HeritageClause[] = [];
				if (behaviors.length > 1) { // We have behaviors here
					let newHeritageClause: ts.HeritageClause = null;
					if (this.options.applyDeclarativeEventListenersMixin) {
						// let extendsExpression = ts.createExpressionWithTypeArguments(
						// 	/* ts.TypeNode[] */ undefined,
						// 	/* ts.Expression */ undefined
						// );
						// newHeritageClause = ts.createHeritageClause(
						// 	ts.SyntaxKind.ExtendsKeyword,
						// 	/* ts.ExpressionWithTypeArguments[] */ [extendsExpression]
						// );
					}
					if (this.options.applyGestureEventListenersMixin) {
						// let extendsExpression = ts.createExpressionWithTypeArguments(
						// 	/* ts.TypeNode[] */ undefined,
						// 	/* ts.Expression */ undefined
						// );
						// newHeritageClause = ts.updateHeritageClause(
						// 	newHeritageClause,
						// 	[extendsExpression],
						// );
					}
				}else if (behaviors.length === 1 && !this.options.changeComponentClassExtension) {
					newHeritages = heritages;
				}else if (behaviors.length === 1 && this.options.changeComponentClassExtension) {
					if (heritages.length === 1) {
						let propAccessExp = ts.createPropertyAccess(
							ts.createIdentifier('Polymer'),
							ts.createIdentifier('Element')
						);
						let expWithArgs = ts.createExpressionWithTypeArguments(
							[],
							propAccessExp
						);
						let newHeritage = ts.updateHeritageClause(
							heritages[0],
							[expWithArgs]
						);
						newHeritages.push(newHeritage);
						notify.msg += ' and extension statement';
					}
				}
				let newClassDecl = ts.updateClassDeclaration(
					/* ts.ClassDeclaration */ classDecl,
					/* ts.Decorator[] */ [newDecorator],
					/* ts.Modifier[] */ classDecl.modifiers,
					/* ts.Identifier */ classDecl.name,
					/* ts.TypeParameterDeclaration */ classDecl.typeParameters,
					/* ts.HeritageClause[] */ newHeritages,
					/* ts.ClassElement[] */ classDecl.members
				);
				chgRec = {
					changeType: TransformChangeType.ClassModify,
					origNode: classDecl,
					newNode: newClassDecl,
					notification: notify
				};
				this._notifications.push(notify);
			}
		}
		return chgRec;
	}
	/**
	 * Transform a computed property
	 * @param methodDecl {ts.MethodDeclaration}
	 * @return {TransformChangeRecord}
	 */
	transformComputedProp(methodDecl: ts.MethodDeclaration): TransformChangeRecord {
		let chgRec: TransformChangeRecord = null;
		if (methodDecl && ts.isMethodDeclaration(methodDecl)) {
			let methodName = methodDecl.name.getText(this._sourceFile);
			let rpCompProp = new RedPill.ComputedProperty(methodDecl);
			rpCompProp.sourceFile = this._sourceFile;
			let notify: Notification =  {
				type: NotificationType.INFO,
				msg: 'Computed Property ' + rpCompProp.propertyName + '. Replaced the ' + methodName + ' method with a getter.'
			};
			let decorator: ts.Decorator = transformUtils.getPolymerTsDecorator(methodDecl, this._sourceFile);
			let newDecorators: ts.Decorator[] = [];
			if (decorator) {
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
	/**
	 * Transform a listener
	 * @param methodDecl {ts.MethodDeclaration}
	 * @return {TransformChangeRecord}
	 */
	transformListener(methodDecl: ts.MethodDeclaration): TransformChangeRecord {
		let chgRec: TransformChangeRecord = null;
		if (methodDecl && ts.isMethodDeclaration(methodDecl)) {
			let decorator = transformUtils.getPolymerTsDecorator(methodDecl, this._sourceFile);
			if (decorator && transformUtils.isListenerDecorator(decorator, this._sourceFile)) {
				let classDecl: TransformChangeRecord = this._findExistingClassDeclaration();
				if (this.options.applyDeclarativeEventListenersMixin) {
					let rpListener = new RedPill.Listener(methodDecl);
					rpListener.sourceFile = this._sourceFile;
					let params: ts.Expression[] = [];
					params.push(rpListener.eventDeclaration);
					let elementId = rpListener.elementId;
					if (!elementId) {
						params.push(ts.createIdentifier('document'));
					}else {
						params.push(ts.createStringLiteral(rpListener.elementId));
					}
					let newDecorator: ts.Decorator = transformUtils.updateDecorator(decorator, 'listen', params, this._sourceFile);
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
					let notify: Notification = {
						type: NotificationType.INFO,
						msg: 'Updated listen decorator for ' + rpListener.methodName
					};
					chgRec = {
						changeType: TransformChangeType.MethodModify,
						origNode: methodDecl,
						newNode: newMethod,
						notification: notify,
						polymerTsModel: rpListener
					};
					this._notifications.push(notify);
				}else {
					// TODO:
					let readyMethod = this._findReadyMethod();
					if (readyMethod) {
						let listenerChgRec: ListenerAddToReadyChangeRecord = {
							changeType: TransformChangeType.ListenerAddToReady,
							origNode: readyMethod,
							listenerMethod: methodDecl,
							createReadyMethod: readyMethod ? false : true,
							eventName: null,
							eventTarget: null
						}
					}
				}
			}
		}
		return chgRec;
	}
	/**
	 * Transform an observer
	 * @param methodDecl {ts.MethodDeclaration}
	 * @return {TransformChangeRecord}
	 */
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
					if (existPropChgRec) {
						let existingProp = existPropChgRec.newNode ? <ts.PropertyDeclaration> existPropChgRec.newNode : <ts.PropertyDeclaration> existPropChgRec.origNode;
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
								msg: 'Found a change record for property ' + argName + ', no new node was defined transforming observer ' + rpObserver.methodName + '!'
							};
						}
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
				let newMethod = transformUtils.updateMethodDecorator(methodDecl, newDecorators);
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
	/**
	 * Transform a declared property
	 * @param propertyDecl {ts.PropertyDeclaration}
	 * @return {TransformChangeRecord}
	 */
	transformProperty(propertyDecl: ts.PropertyDeclaration): TransformChangeRecord {
		let chgRec: TransformChangeRecord = null;
		if (propertyDecl && ts.isPropertyDeclaration(propertyDecl)) {
			let rpProp = new RedPill.Property(propertyDecl);
			rpProp.sourceFile = this._sourceFile;
			let notify: Notification = null;
			if (rpProp.containsValueArrayLiteral || rpProp.containsValueFunction || rpProp.containsValueObjectDeclaration || rpProp.containsValueBoolean || rpProp.containsValueStringLiteral) {
				let valueInit = transformUtils.getPropertyValueExpression(propertyDecl, this._sourceFile);
				let propDelValue = transformUtils.removePropertyFromPropertyDecl(propertyDecl, 'value', this._sourceFile);
				let propWithInitializer = transformUtils.addInitializerToPropertyDecl(propDelValue, valueInit);
				notify = {
					type: NotificationType.INFO,
					msg: 'Property ' + rpProp.name + ' has a value defined. Moved initializer to property instead of decorator'
				};
				chgRec = {
					changeType: TransformChangeType.PropertyAddValueInitializer,
					origNode: propertyDecl,
					newNode: propWithInitializer,
					notification: notify
				};
			}else {
				// No changes required
				notify = {
					type: NotificationType.INFO,
					msg: 'Property ' + rpProp.name + ' no modifications required'
				};
				chgRec = {
					changeType: TransformChangeType.PropertyModify,
					origNode: propertyDecl,
					newNode: null,
					notification: notify
				};
			}
			this._notifications.push(notify);
		}
		return chgRec;
	}
	/**
	 * Locate an already processed declared property in the _transformNodeMap
	 * @param propertyName {string}
	 * @return {TransformChangeRecord}
	 */
	private _findExistingDeclaredProperty(propertyName: string): TransformChangeRecord {
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
	/**
	 * Find an already processed Class Declaration
	 * @return {TransformChangeREcord}
	 */
	private _findExistingClassDeclaration(): TransformChangeRecord {
		let existingClass = null;
		this._transformNodeMap.forEach((val: TransformChangeRecord, key: ts.Node, map: Map<ts.Node, TransformChangeRecord>) => {
			if (ts.isClassDeclaration(key) && RedPill.isComponent(key, this._sourceFile)) {
				existingClass = val;
			}
		});
		return existingClass;
	}
	/**
	 * Find an already processed Method Declaration named 'ready'
	 * @return {TransformChangeRecord}
	 */
	private _findReadyMethod(): TransformChangeRecord {
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
