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
	PropertyChange,
	PropertyAddition,
	AddTSReferenceTag,
	AddDeclarativeEventsBehavior,
	AddGestureEventsBehavior,
	AddListenerToReady
}
export interface TransformChangeRecord {
	origNode: ts.Node;
	changeType: TransformChangeType
	newNode?: ts.Node,
	listenerMethod?: ts.Node,
	createReadyMethod?: boolean,
	refNodePath?: string,
	origNodeName?: string,
	removeNode?: ts.Node,
	removeDecorator?: ts.Decorator
}
