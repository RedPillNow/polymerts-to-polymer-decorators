import * as ts from 'typescript';
import * as chalk from './chalkConfig';
import {RedPill} from 'polymerts-models';
import {TransformChangeRecord, TransformChangeType, ConverterOptions, NotificationType, Notification} from './custom-types';
import * as transformUtils from './utils';

/**
 * @class
 * @classdesc The transformer factory. This is where the visitor pattern starts
 */
export class PolymerTsTransformerFactory {
	private _sourceFile: ts.SourceFile;
	private _targetPolymerVersion: number;
	private _options: ConverterOptions;
	private _transformer: PolymerTsTransformer;

	/**
	 * @param sourceFile {ts.SourceFile}
	 * @param options {ConverterOptions}
	 * @param targetPolymerVersion {number} not currently used
	 */
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
	/**
	 * Return the PolymerTsTransformer instance
	 * @type {PolymerTsTransformer}
	 */
	get transformer() {
		return this._transformer;
	}
	/**
	 * Do a pre-transform
	 * @param ctx {ts.TransformationContext}
	 * @return {ts.Transformer<ts.SourceFile>}
	 */
	preTransform(ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
		console.log(chalk.processing('Analyzing source file for required changes...'));
		let preSource = ts.createSourceFile(this._sourceFile.fileName, this._sourceFile.getText(), this._sourceFile.languageVersion);
		let preTransform: ts.Transformer<ts.SourceFile> = this._transformer.preTransform.apply(this._transformer, [ctx, preSource]);
		return preTransform;
	}
	/**
	 * Transform the nodes defined in transformer.transformNodeMap
	 * @param ctx {ts.TransformationContext}
	 * @return {ts.Transformer<ts.SourceFile>}
	 */
	transform(ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
		let preTransform: ts.TransformationResult<ts.SourceFile> = ts.transform(this._sourceFile, [this.preTransform.bind(this)]);
		console.log(chalk.processing('Transforming source file. Found ' + this.transformer.transformNodeMap.size + ' changes to be made...'));
		let transformer: ts.Transformer<ts.SourceFile> = this._transformer.transform.apply(this._transformer, [ctx, this._sourceFile]);
		return transformer;
	}
}
/**
 * @class
 * @classdesc Uses the visitor pattern to transform PolymerTS decorators and some code
 * to be compliant with polymer-decorators
 */
export class PolymerTsTransformer {
	private _ctx: ts.TransformationContext;
	private _sourceFile: ts.SourceFile;
	private _options: ConverterOptions;
	private _transformNodeMap: Map<ts.Node, TransformChangeRecord> = new Map();
	private _addReadyMethod: boolean = false;
	private _notifications: Notification[] = [];

	/**
	 * @param options {ConverterOptions}
	 */
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
	notifyUser(notification: Notification) {
		let msg = null;
		if (notification && notification.type === NotificationType.INFO) {
			msg = chalk.processing(notification.msg);
		}else if (notification && notification.type === NotificationType.WARN) {
			msg = chalk.warning(notification.msg);
		}else if (notification && notification.type === NotificationType.ERROR) {
			msg = chalk.error(notification.msg);
		}else {
			msg = chalk.processing(notification.msg);
		}
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
	 * that will subsequently be placed in the {@link transformNodeMap}
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
	 * Use the visitor pattern to walk each node, if that node is in the {@link transformNodeMap} and it has a newNode
	 * defined, then return that newNode
	 * @param ctx {ts.TransformationContext}
	 * @returns {tx.Transformer<ts.SourceFile>}
	 */
	transform(ctx: ts.TransformationContext, sf: ts.SourceFile): ts.Transformer<ts.SourceFile> {
		this._sourceFile = sf;
		this._ctx = ctx;
		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			node = ts.visitEachChild(node, visitor, ctx);
			let transformChgRec = this._transformNodeMap.get(node);
			if (ts.isClassDeclaration(node) && !transformChgRec) {
				let classDecl = <ts.ClassDeclaration> node;
				if (RedPill.isComponent(classDecl, this._sourceFile)) {
					// console.log(chalk.processing('*******Looking for a class named ' + classDecl.name.getText(this._sourceFile) + '*******'));
					let className = transformUtils.getClassNameFromClassDeclaration(classDecl, this._sourceFile);
					transformChgRec = this._findExistingClassDeclaration(className);
					if (!transformChgRec) {
						console.log(chalk.warning('Could not find a change record for the component class!'));
						return node;
					}
				}
			}
			if (transformChgRec) {
				// console.log(chalk.processing('Found a change record for ' + ts.SyntaxKind[node.kind]));
				let newNode = transformChgRec.newNode;
				if (newNode && newNode.kind === node.kind) {
					this.notifyUser(transformChgRec.notification);
					return newNode;
				}else if (newNode && newNode.kind !== node.kind) {
					if (transformChgRec.changeType === TransformChangeType.MethodReplace) {
						this.notifyUser(transformChgRec.notification);
						return newNode;
					}else {
						let warn = chalk.warning('Seems we need to replace a node: ' + node.getText(this._sourceFile));
						console.log(warn);
						return node;
					}
				}else {
					return node;
				}
			}
			return node;
		}
		return (rootNode): ts.SourceFile => {
			return ts.visitNode(rootNode, visitor);
		}
	}
	/**
	 * Transform the class declaration statement. Luckily the ts compiler is smart enough
	 * to process this last
	 * @param classDecl {ts.ClassDeclaration}
	 * @return {TransformChangeRecord}
	 */
	transformClassDecl(classDecl: ts.ClassDeclaration): TransformChangeRecord {
		let chgRec: TransformChangeRecord = null;
		if (classDecl && ts.isClassDeclaration(classDecl)) {
			let newDecorator: ts.Decorator = this.renameDecorator(classDecl, transformUtils.polymerTsRegEx.component, 'customElement');
			if (newDecorator) {
				let notify: Notification = {
					type: NotificationType.INFO,
					msg: 'Updated the class statement decorator.'
				};
				let behaviors: RedPill.IncludedBehavior[] = transformUtils.getComponentBehaviors(classDecl, this._sourceFile);

				let heritages: ts.HeritageClause[] = [].concat(classDecl.heritageClauses);
				let newHeritages: ts.HeritageClause[] = [];
				let heritage: ts.HeritageClause = heritages[0];
				let newHeritage: ts.HeritageClause = heritage;
				if (behaviors.length > 0) { // We have behaviors here
					if (!this.options.changeComponentClassExtension) {
						newHeritages = heritages;
					}else {
						newHeritages = transformUtils.getClassHeritageExtendsPolymer(classDecl, this.options, this._sourceFile);
						newHeritage = newHeritages[0];
						notify.msg += ' Changed extension point to Polymer.Element.';
					}

					for (let i = 0; i < behaviors.length; i++) {
						if (i === 0 && !newHeritage) {
							newHeritage = this.addBehaviorToHeritage(heritage, behaviors[i], this._sourceFile);
						}else {
							newHeritage = this.addBehaviorToHeritage(newHeritage, behaviors[i], this._sourceFile);
						}
						notify.msg += ' Added behavior ' + behaviors[i].name + '.';
					}
					newHeritages = [newHeritage];
				}else if (!this.options.changeComponentClassExtension) {
					newHeritages = heritages;
				}else {
					newHeritages = transformUtils.getClassHeritageExtendsPolymer(classDecl, this.options, this._sourceFile);
					notify.msg += ' Changed extension point to Polymer.Element.';
				}
				if (this.options.applyGestureEventListenersMixin) {
					let gestBehavior = new RedPill.IncludedBehavior();
					gestBehavior.behaviorDeclarationString = 'Polymer.GestureEventListeners';
					newHeritage = this.addBehaviorToHeritage(newHeritage, gestBehavior, this._sourceFile);
					newHeritages = [newHeritage];
					notify.msg += ' Added behavior Polymer.GestureEventListeners.';
				}
				if (this.options.applyDeclarativeEventListenersMixin) {
					let declEvtBehavior = new RedPill.IncludedBehavior();
					declEvtBehavior.behaviorDeclarationString = 'Polymer.DeclarativeEventListeners';
					newHeritage = this.addBehaviorToHeritage(newHeritage, declEvtBehavior, this._sourceFile);
					newHeritages = [newHeritage];
					notify.msg += ' Added behavior Polymer.DeclarativeEventListeners.';
				}
				let classMems = this.updateClassMembers(classDecl);
				let newClassDecl = ts.updateClassDeclaration(
					/* ts.ClassDeclaration */ classDecl,
					/* ts.Decorator[] */ [newDecorator],
					/* ts.Modifier[] */ classDecl.modifiers,
					/* ts.Identifier */ classDecl.name,
					/* ts.TypeParameterDeclaration */ classDecl.typeParameters,
					/* ts.HeritageClause[] */ newHeritages,
					/* ts.ClassElement[] */ classMems
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
					const callExp: ts.CallExpression = <ts.CallExpression> decorator.expression;
					let objLit: ts.ObjectLiteralExpression = <ts.ObjectLiteralExpression> callExp.arguments[0];
					const hasValueProp: boolean = transformUtils.getObjectLiteralPropertyExpression(objLit, 'value', this._sourceFile) ? true : false;
					if (hasValueProp) {
						objLit = transformUtils.removePropertyFromObjectLiteral(objLit, 'value', this._sourceFile);
					}
					const newCallExp: ts.CallExpression = ts.createCall(
						/* ts.Expression */ ts.createIdentifier('property'),
						/* ts.TypeNode */ undefined,
						/* args ts.Expression[] */ [objLit]
					);
					const newPropertyDecorator: ts.Decorator = ts.createDecorator(
						/* ts.Expression */ newCallExp
					);
					newDecorators.push(newPropertyDecorator);
					notify.msg += ' Added a property decorator';
				}
				const newArgs: ts.StringLiteral[] = transformUtils.getArgsFromNode(methodDecl, this._sourceFile);
				const updatedDecorator = this.updateDecorator(decorator, 'computed', newArgs);
				newDecorators.push(updatedDecorator);
				const propertyName: ts.Identifier = <ts.Identifier> methodDecl.name;
				// TODO: Need to parse the body looking for property names and change them to use `this.propertyName`
				let newBody = this.addThisToBodyStatements(methodDecl, newArgs);
				const newGetter: ts.GetAccessorDeclaration = ts.createGetAccessor(
					/* ts.Decorator[] */ newDecorators,
					/* ts.Modifier[] */ undefined,
					/* ts.Identifier|ts.StringLiteral */ propertyName,
					/* ts.ParameterDeclaration[] */ undefined,
					/* ts.TypeNode */ undefined,
					/* ts.Block */ newBody
				);
				const replaceMeth: TransformChangeRecord = {
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
				let rpListener = new RedPill.Listener(methodDecl);
				rpListener.sourceFile = this._sourceFile;
				let notify: Notification = null;
				if (this.options.applyDeclarativeEventListenersMixin) {
					let params: ts.Expression[] = [];
					params.push(rpListener.eventDeclaration);
					let elementId = rpListener.elementId;
					if (!elementId) {
						params.push(ts.createIdentifier('document'));
					}else {
						params.push(ts.createStringLiteral(rpListener.elementId));
					}
					let newDecorator: ts.Decorator = this.updateDecorator(decorator, 'listen', params);
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
					notify = {
						type: NotificationType.INFO,
						msg: 'Listener, updated listen decorator for ' + rpListener.methodName
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
					let newMethod = ts.updateMethod(
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
					);
					let notify: Notification = {
						type: NotificationType.INFO,
						msg: 'Listener, removed listen decorator for ' + rpListener.methodName
					};
					chgRec = {
						changeType: TransformChangeType.MethodModify,
						origNode: methodDecl,
						newNode: newMethod,
						notification: notify,
						polymerTsModel: rpListener
					};
					this._notifications.push(notify);
					let readyMethodChg = this._findReadyMethod();
					let readyMethod = null;
					let origReady = null;
					let readyNotify: Notification = null;
					if (!readyMethodChg) {
						readyMethod = this.createReadyMethod();
						this._addReadyMethod = true;
						origReady = readyMethod;
						readyNotify = {
							type: NotificationType.INFO,
							msg: 'Create Ready Method.'
						};
					}else {
						readyMethod = readyMethodChg.newNode ? readyMethodChg.newNode : readyMethodChg.origNode;
						origReady = readyMethodChg.origNode;
						readyNotify = readyMethodChg.notification;
						readyNotify.msg += 'Added listener to ready method.'
					}
					if (readyMethod) {
						let statement = this.createReadyListener(rpListener, this._sourceFile);
						let readyChg = this.addListenerToReady(rpListener, readyMethod, origReady, statement);
						readyChg.notification = readyNotify;
						this._transformNodeMap.set(origReady, readyChg);
						this._notifications.push(readyNotify);
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
							existingProp = this.addPropertyToPropertyDecl(existingProp, 'observer', methodName);
							existPropChgRec.newNode = existingProp;
							this._transformNodeMap.set(existPropChgRec.origNode, existPropChgRec);
							notify = {
								type: NotificationType.INFO,
								msg: 'Observer for ' + argName + ' moved to it\'s relevant property'
							}
						}else {
							notify = {
								type: NotificationType.ERROR,
								msg: 'Observer for ' + argName + '. Found a change record for property ' + argName + ', no new node was defined transforming observer ' + rpObserver.methodName + '!'
							};
						}
					}
				}else if (rpObserver.params && (rpObserver.params.length > 1 || isComplex)) {
					let params: ts.StringLiteral[] = [];
					for (let i = 0; i < rpObserver.params.length; i++) {
						let param: ts.StringLiteral = ts.createStringLiteral(rpObserver.params[i])
						params.push(param);
					}
					let newDecorator: ts.Decorator = this.updateDecorator(decorator, 'observe', params);
					newDecorators.push(newDecorator);
					notify = {
						type: NotificationType.INFO,
						msg: 'Observer decorator method ' + rpObserver.methodName + ' updated'
					}
				}
				let newMethod = this.updateMethodDecorator(methodDecl, newDecorators);
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
			if (rpProp.containsValueArrayLiteral || rpProp.containsValueFunction || rpProp.containsValueObjectDeclaration || rpProp.containsValueBoolean || rpProp.containsValueStringLiteral || rpProp.containsValueNull || rpProp.containsValueUndefined) {
				let valueInit = transformUtils.getPropertyValueExpression(propertyDecl, this._sourceFile);
				let propDelValue = this.removePropertyFromPropertyDecl(propertyDecl, 'value');
				let propWithInitializer = this.addInitializerToPropertyDecl(propDelValue, valueInit);
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
	 * Loop through the members of classDecl, if a node is in {@link transformNodeMap} then add it to the new members
	 * instead of the existing node. Otherwise add the existing node
	 * @param classDecl {ts.ClassDeclaration}
	 * @param nodeMap {Map<ts.Node, TransformChangeRecord>}
	 * @param sf {ts.SourceFile}
	 * @return {ts.ClassElement[]}
	 */
	updateClassMembers(classDecl: ts.ClassDeclaration): ts.ClassElement[] {
		let newMembers = [];
		if (classDecl) {
			let members = classDecl.members;
			for (let i = 0; i < members.length; i++) {
				let member: ts.Node = members[i];
				let chgRec = this._transformNodeMap.get(member);
				if (chgRec && chgRec.newNode) {
					let newNode = chgRec.newNode;
					if (ts.isClassElement(newNode)) {
						// console.log('Adding ' + ts.SyntaxKind[newNode.kind] + ' to newMembers');
						newMembers.push(chgRec.newNode);
					}else {
						console.log('updateClassMembers, Node ' + ts.SyntaxKind[newNode.kind] + ' not a class element')
					}
				}else {
					// console.log('Adding original ' + ts.SyntaxKind[member.kind] + ' to newMembers');
					newMembers.push(member);
				}
			}
			if (this._addReadyMethod) {
				let readyChgRec = this._findReadyMethod();
				if (readyChgRec && readyChgRec.newNode) {
					newMembers.push(readyChgRec.newNode);
				}
			}
		}
		return newMembers;
	}
	/**
	 * Add an event listener statement to the body of a method
	 * @param rpListener {RedPill.Listener}
	 * @param readyMethodDecl {ts.MethodDeclaration}
	 * @param origReadyMethod {ts.MethodDeclaration}
	 * @param stmt {ts.Node}
	 */
	addListenerToReady(rpListener: RedPill.Listener, readyMethodDecl: ts.MethodDeclaration, origReadyMethod: ts.MethodDeclaration, stmt: ts.Node): TransformChangeRecord {
		let chgRec: TransformChangeRecord = null;
		if (rpListener && readyMethodDecl && origReadyMethod && stmt) {
			let newStmts = readyMethodDecl.body ? [].concat(readyMethodDecl.body.statements) : [];
			newStmts.push(this.createReadyListener(rpListener, this._sourceFile));
			let newBlock = readyMethodDecl.body ? ts.updateBlock(readyMethodDecl.body, newStmts) : ts.createBlock(newStmts, true);
			let newReady = ts.updateMethod(
				readyMethodDecl,
				[],
				readyMethodDecl.modifiers,
				readyMethodDecl.asteriskToken,
				readyMethodDecl.name,
				readyMethodDecl.questionToken,
				readyMethodDecl.typeParameters,
				readyMethodDecl.parameters,
				readyMethodDecl.type,
				newBlock
			);
			chgRec = {
				changeType: TransformChangeType.ListenerAddToReady,
				origNode: origReadyMethod,
				newNode: newReady
			}
		}
		return chgRec;
	}
	/**
	 * Create a ready method
	 * @param sf {ts.SourceFile}
	 * @return {ts.MethodDeclaration}
	 */
	createReadyMethod(): ts.MethodDeclaration {
		return ts.createMethod(
			/* ts.Decorator[] */ undefined,
			/* ts.Modifier[] */ undefined,
			/* ts.AsteriskToken */ undefined,
			/* name */ 'ready',
			/* ts.QuestionToken */ undefined,
			/* ts.TypeParameterDeclaration */ undefined,
			/* ts.ParameterDeclaration[] */ undefined,
			/* ts.TypeNode */ undefined,
			/* ts.Block */ ts.createBlock([], true)
		)
	}
	/**
	 * Create an event listener to place in the `ready` function
	 * @param rpListener {RedPill.Listener}
	 * @param sf {ts.SourceFile}
	 * @return {ts.Node}
	 */
	createReadyListener(rpListener: RedPill.Listener, sf: ts.SourceFile): ts.Node {
		let statement = null;
		if (rpListener) {
			let propAcc = ts.createPropertyAccess(
				/* ts.Expression */ ts.createIdentifier(rpListener.elementId || 'document'),
				/* string */ 'addEventListener'
			);
			let callArgs = [];
			callArgs.push(ts.createStringLiteral(rpListener.eventName));
			callArgs.push(ts.createPropertyAccess(ts.createThis(), rpListener.method.methodName));
			let call = ts.createCall(
				/* ts.Expression */ propAcc,
				/* ts.TypeNode[] */ undefined,
				/* ts.Expression[] args */ callArgs
			);
			statement = ts.createStatement(
				/* ts.Expression */ call
			);
		}
		return statement;
	}
	/**
	 * Wrap the existing heritage clause in a mixin
	 * @param heritageCl {ts.HeritageClause}
	 * @param rpBehavior {string}
	 * @param sf {ts.SourceFile}
	 * @return {ts.HeritageClause}
	 */
	addBehaviorToHeritage(heritageCl: ts.HeritageClause, rpBehavior: RedPill.IncludedBehavior, sf: ts.SourceFile): ts.HeritageClause {
		let newHeritage: ts.HeritageClause = heritageCl;
		if (heritageCl && rpBehavior && heritageCl.types && heritageCl.types.length > 0) {
			let types = heritageCl.types;
			let type: ts.ExpressionWithTypeArguments = types[0];
			let newTypes: ts.ExpressionWithTypeArguments[] = [];
			if (ts.isIdentifier(type.expression) || ts.isPropertyAccessExpression(type.expression)) { // extends "someClass/some.class"
				let newCall = ts.createCall(
					/* ts.Expression */ rpBehavior.propertyAccessExpression,
					/* ts.TypeNode[] */ undefined,
					/* ts.Expression[] args */ [type.expression]
				);
				let newType = ts.updateExpressionWithTypeArguments(
					/* ts.ExpressionWithTypeArgs */ type,
					/* ts.TypeNode[] */ type.typeArguments,
					/* ts.Expression */ newCall
				);
				newTypes.push(newType);
			}else if (ts.isCallExpression(type.expression)) { // extends "someMixin(someOtherMixin/someClass)"
				let newCall = ts.createCall(
					/* ts.Expression */ rpBehavior.propertyAccessExpression,
					/* ts.TypeNode[] */ undefined,
					/* ts.Expression[] args */ [type.expression]
				);
				let newType = ts.updateExpressionWithTypeArguments(
					/* ts.ExpressionWithTypeArgs */ type,
					/* ts.TypeNode[] */ type.typeArguments,
					/* ts.Expression */ newCall
				);
				newTypes.push(newType);
			}

			newHeritage = ts.updateHeritageClause(
				/* ts.HeritageClause */ heritageCl,
				/* ts.ExpressionWithTypeArguments[] */ newTypes
			);
		}
		return newHeritage;
	}
	/**
	 * Add an initializer to a property decorator
	 * @param propDecl {ts.PropertyDeclaration}
	 * @param initializer {ts.Expression}
	 * @return {ts.PropertyDeclaration}
	 */
	addInitializerToPropertyDecl(propDecl: ts.PropertyDeclaration, initializer: ts.Expression): ts.PropertyDeclaration {
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
	 * Remove a property from a property decorator argument
	 * @param propDecl {ts.PropertyDeclaration}
	 * @param propertyName {string} the property name to remove
	 * @param sf {ts.SourceFile}
	 * @return {ts.PropertyDeclaration}
	 */
	removePropertyFromPropertyDecl(propDecl: ts.PropertyDeclaration, propertyName: string): ts.PropertyDeclaration {
		let newProp = propDecl;
		if (propDecl) {
			let existingPropDec = transformUtils.getPolymerTsDecorator(propDecl, this._sourceFile);
			if (!existingPropDec) {
				existingPropDec = propDecl.decorators[0];
			}
			let objLit = (<ts.ObjectLiteralExpression> (<ts.CallExpression> existingPropDec.expression).arguments[0]);
			let hasProperty: boolean = transformUtils.getObjectLiteralPropertyExpression(objLit, propertyName, this._sourceFile) ? true : false;
			if (hasProperty) {
				objLit = transformUtils.removePropertyFromObjectLiteral(objLit, propertyName, this._sourceFile);
			}
			let newObjLit = ts.updateObjectLiteral(
				/* ts.ObjectLiteralExpression */ objLit,
				/* ts.ObjectLiteralElementLike */ objLit.properties
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
	 * Add a property to a property decorator argument
	 * @param propDecl {ts.PropertyDeclaration} the property to update
	 * @param newPropName {string} new name for a property
	 * @param newPropInitializer {string} new property initialiazer
	 * @param sf {ts.SourceFile}
	 * @return {ts.PropertyDeclaration}
	 */
	addPropertyToPropertyDecl(propDecl: ts.PropertyDeclaration, newPropName: string, newPropInitializer: string): ts.PropertyDeclaration {
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
	 * Update a decorator with a new name and/or parameters
	 * @param existingDecorator {ts.Decorator} decorator to update
	 * @param decoratorName {string} new decorator name
	 * @param params {ts.Expression[]} new parameters to add to the decorator
	 * @param sf {ts.SourceFile}
	 * @return {ts.Decorator}
	 * @todo decorator name and params should be able to be null, then we just update the
	 * CallExpression. This would negate renameDecorator
	 */
	updateDecorator(existingDecorator: ts.Decorator, decoratorName: string, params: ts.Expression[]): ts.Decorator {
		let newDecorator: ts.Decorator = null;
		if (decoratorName && existingDecorator) {
			const newIdent = ts.createIdentifier(decoratorName);
			const newArgs: ts.StringLiteral[] = transformUtils.getArgsFromNode(existingDecorator, this._sourceFile);
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
	renameDecorator(parentNode: ts.Node, polymerTsRegEx: RegExp, newDecoratorText: string): ts.Decorator {
		let decorators = parentNode.decorators;
		let newDecorator: ts.Decorator = null;
		for (let i = 0; i < decorators.length; i++) {
			let dec: ts.Decorator = <ts.Decorator> decorators[i];
			let decText = dec.expression.getText(this._sourceFile);
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
	updateMethodDecorator(methodDecl: ts.MethodDeclaration, newDecorators: ts.Decorator[]): ts.MethodDeclaration {
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
	 * Take the body of a MethodDeclaration, parse the statements looking for references to anything in
	 * oldArgs and transform the identifier from `someArg` to `this.someArg` PropertyAccessExpression
	 * @param methodDecl {ts.MethodDeclaration}
	 * @param oldArgs {ts.StringLiteral[]}
	 * @return {ts.Block}
	 */
	addThisToBodyStatements(methodDecl: ts.MethodDeclaration, oldArgs: ts.StringLiteral[]): ts.Block {
		let newBody: ts.Block = methodDecl.body;
		if (methodDecl && ts.isMethodDeclaration(methodDecl) && methodDecl.body) {
			let statements = [].concat(methodDecl.body.statements);
			let argStrs: string[] = [];
			for (let i = 0; i < oldArgs.length; i++) {
				let argStrLit = oldArgs[i];
				let argStr = argStrLit.text;
				argStrs.push(argStr);
			}
			let lastNodeWasThis = false;
			let parseKids = (node: ts.Node) => {
				node = ts.visitEachChild(node, parseKids, this.ctx);
				if (ts.isIdentifier(node)) {
					let ident = <ts.Identifier> node;
					let identText = ident.text;
					if (argStrs.indexOf(identText) > -1 && !lastNodeWasThis) {
						let newPropAcc = ts.createPropertyAccess(
							ts.createThis(),
							identText
						);
						lastNodeWasThis = false;
						return newPropAcc;
					}else {
						lastNodeWasThis = false;
						return node;
					}
				}else if (node.kind === ts.SyntaxKind.ThisKeyword) {
					lastNodeWasThis = true;
					return node;
				}
				lastNodeWasThis = false;
				return node;
			}
			let newStmts = [];
			for (let i = 0; i < statements.length; i++) {
				let workingStmt = statements[i];
				newStmts.push(ts.visitNode(workingStmt, parseKids));
			}
			newBody = ts.updateBlock(
				methodDecl.body,
				newStmts
			);
		}
		return newBody;
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
	private _findExistingClassDeclaration(className: string): TransformChangeRecord {
		let existingClass = null;
		this._transformNodeMap.forEach((val: TransformChangeRecord, key: ts.Node, map: Map<ts.Node, TransformChangeRecord>) => {
			if (ts.isClassDeclaration(key) && RedPill.isComponent(key, this._sourceFile)) {
				let keyClassName = transformUtils.getClassNameFromClassDeclaration(key, this._sourceFile);
				let valClassDecl = <ts.ClassDeclaration> val.origNode;
				let valClassName = transformUtils.getClassNameFromClassDeclaration(valClassDecl, this._sourceFile);
				if (keyClassName === valClassName && keyClassName === className) {
					existingClass = val;
				}
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
				if (methodName === 'ready' || methodName === '') {
					readyMeth = val;
				}
			}
		});
		return readyMeth;
	}
}
