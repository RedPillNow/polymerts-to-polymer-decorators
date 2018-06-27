import * as ts from 'typescript';

export interface ConverterOptions {
	changeInline: boolean,
	outputPath: string,
	useMetadataReflection: boolean,
	conversionType?: 'polymer-decorators',
	targetPolymerVersion?: 2|3,
	moveSinglePropertyObserversToProperty: boolean,
	applyDeclarativeEventListenersMixin: boolean,
	applyGestureEventListenersMixin: boolean,
	pathToBowerComponents: string,
	changeComponentClassExtension: boolean,
	glob: any,
	compiler: ts.CompilerOptions
}

export enum TransformChangeType {
	/** Add a new property to a declared property */
	PropertyAddProperty,
	/** Create a new declared property */
	PropertyCreate,
	/** Add a initializer to a declared property */
	PropertyAddValueInitializer,
	/** Add a reference tag */
	AddTSReferenceTag,
	/** Add the DeclarativeEventsBehavior mixin to the class declaration */
	ClassAddDeclarativeEventsBehavior,
	/** Add the GestureEventsBehavior mixin to the class declaration */
	ClassAddGestureEventsBehavior,
	/** Add a behavior that is not the DeclarativeEvents or GestureEvents behaviors */
	ClassAddBehavior,
	/** Create a standard event listener in the "ready" function */
	ListenerAddToReady,
	/** Create a new method */
	MethodCreateNew,
	/** Modify a method's body */
	MethodModify,
	/** Change the decorator */
	DecoratorModify
}
export interface TransformChangeRecord {
	/** The node that we will modify */
	origNode: ts.Node;
	/** The type of change to be made */
	changeType: TransformChangeType
	/** The transformed node */
	newNode?: ts.Node,
	/** True to create a ready method to add listeners to */
	createReadyMethod?: boolean,
	/** A node that should be removed */
	removeNode?: ts.Node,
	/** A Decorator that should be removed */
	removeDecorator?: ts.Decorator
}

export interface PropertyAddPropertyChangeRecord extends TransformChangeRecord {
	/** The new property name */
	newPropertyName: string,
	/** The value of the new property */
	newPropertyValue: string
}

export interface PropertyCreateChangeRecord extends TransformChangeRecord {

}

export interface PropertyAddValueInitializer extends TransformChangeRecord {

}

export interface ListenerAddToReadyChangeRecord extends TransformChangeRecord {
	/** The listener MethodDeclaration node */
	listenerMethod: ts.MethodDeclaration,
	/** The event name to be added */
	eventName: string,
	/** The event target that will fire the event */
	eventTarget: string
}

export interface RefNodeCreateChangeRecord extends TransformChangeRecord {
	/** The path for a reference tag */
	refNodePath: string
}

