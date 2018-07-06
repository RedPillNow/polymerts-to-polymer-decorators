import * as ts from 'typescript';
import {RedPill} from 'polymerts-models';

/**
 * The options which control how source files are converted, where they are placed
 * and what should be ignored
 */
export interface ConverterOptions {
	/** Set to `true` to modify original file */
	changeInline: boolean,
	/** The path where transformed files should be placed */
	outputPath: string,
	/** Use the Metadata Reflection API https://rbuckton.github.io/reflect-metadata/ if `true` */
	useMetadataReflection: boolean,
	/** The type of conversion to perform. Currently only 'polymer-decorators' is supported */
	conversionType?: 'polymer-decorators',
	/** The polymer version to convert to. Currently only version 2 is supported */
	targetPolymerVersion?: 2|3,
	/** Set to `true` to just add an observer property to the declared property this observer observes */
	moveSinglePropertyObserversToProperty: boolean,
	/** If you want to use @listen decorators, set this to `true` */
	applyDeclarativeEventListenersMixin: boolean,
	/** If you need to support 'tap' and 'track' gesture events, set this to `true` */
	applyGestureEventListenersMixin: boolean,
	/** The relative path to bower_components */
	pathToBowerComponents: string,
	/** If a class does not extend `Polymer.Element`. Setting this to `true`, will change the class extension to `Polymer.Element`. If you have a custom component base, set this to `false` */
	changeComponentClassExtension: boolean,
	/** File we should ignore */
	glob: {
		ignore: string[]
	},
	/** TypeScript compiler options, best to not include this so the default will be used */
	compiler: ts.CompilerOptions
}
/**
 * The type of notifications we may include somewhere
 */
export enum NotificationType {
	WARN,
	ERROR,
	INFO,
	ACTION_REQUIRED
}
/**
 * A notification about the transform. These ultimately will
 * be action items
 */
export interface Notification {
	type: NotificationType,
	msg: string
}
/**
 * Defines the type of change which should be performed
 */
export enum TransformChangeType {
	/** Add a new property to a declared property */
	PropertyAddProperty,
	/** Create a new declared property */
	PropertyCreate,
	/** Add a initializer to a declared property */
	PropertyAddValueInitializer,
	PropertyModify,
	/** Add a reference tag */
	AddTSReferenceTag,
	/** Add the DeclarativeEventsBehavior mixin to the class declaration */
	ClassAddDeclarativeEventsBehavior,
	/** Add the GestureEventsBehavior mixin to the class declaration */
	ClassAddGestureEventsBehavior,
	/** Add a behavior that is not the DeclarativeEvents or GestureEvents behaviors */
	ClassAddBehavior,
	/** Modify the class statement */
	ClassModify,
	/** Create a standard event listener in the "ready" function */
	ListenerAddToReady,
	/** Replace a method with a new method */
	MethodReplace,
	/** Rename a method */
	MethodRename,
	/** Modify a method's body */
	MethodModify,
	/** Change the decorator */
	DecoratorModify,
	/** Remove a decorator */
	DecoratorRemove
}
/**
 * Defines a change to be performed
 */
export interface TransformChangeRecord {
	/** The type of change to be made */
	changeType: TransformChangeType,
	/** The node that we will modify */
	origNode?: ts.Node,
	/** A notification that goes with this change record */
	notification?: Notification,
	/** The PolymerTs Model */
	polymerTsModel?: RedPill.ProgramPart,
	/** The transformed node */
	newNode?: ts.Node,
	/** True to create a ready method to add listeners to */
	createReadyMethod?: boolean,
	/** A node that should be removed */
	removeNode?: ts.Node,
	/** A Decorator that should be removed */
	removeDecorator?: ts.Decorator
}
/**
 * Add a property to a declared property, use this change record
 */
export interface PropertyAddPropertyChangeRecord extends TransformChangeRecord {
	/** The new property name */
	newPropertyName: string,
	/** The value of the new property */
	newPropertyValue: string
}
/**
 * Create a new declared property
 */
export interface PropertyCreateChangeRecord extends TransformChangeRecord {
	propertyName: string,
	computedMethod?: string,
	observerMethod?: string,
	propertyPropertiesObject?: ts.ObjectLiteralExpression
}
/**
 * Add a property initializer
 */
export interface PropertyAddValueInitializer extends TransformChangeRecord {

}
/**
 * Add a listener to the ready function
 */
export interface ListenerAddToReadyChangeRecord extends TransformChangeRecord {
	/** The listener MethodDeclaration node */
	listenerMethod: ts.MethodDeclaration,
	/** The event name to be added */
	eventName: string,
	/** The event target that will fire the event */
	eventTarget: string
}

export interface MethodRenameChangeRecord extends TransformChangeRecord {
	newName: string
}
/**
 * Add a `/// <ref path="[some/path]>` tag
 */
export interface RefNodeCreateChangeRecord extends TransformChangeRecord {
	/** The path for a reference tag */
	refNodePath: string
}

export interface PropertyOptions {
	/**
	 * This field can be omitted if the Metadata Reflection API is configured.
	 */
	type?: string;
	notify?: boolean;
	reflectToAttribute?: boolean;
	readOnly?: boolean;
	computed?: string;
	observer?: string|((val: {}, old: {}) => void);
  }

