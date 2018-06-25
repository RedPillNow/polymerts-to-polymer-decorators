import * as ts from 'typescript';

export enum PolymerDecorators {
	CUSTOMELEMENT = '@customElement',
	PROPERTY = '@property',
	COMPUTED = '@computed',
	OBSERVE = '@observe',
	QUERY = '@query',
	QUERYALL = '@queryAll',
	LISTEN = '@listen'
}

export interface ConverterOptions {
	changeInline: boolean,
	outputPath: string,
	useMetadataReflection: boolean,
	conversionType?: 'polymer-decorators',
	targetPolymerVersion?: 2|3,
	moveSinglePropertyObserversToProperty: boolean,
	applyDeclarativeEventListenersMixin: boolean,
	applyGestureEventListenersMixin: boolean,
	glob: any,
	compiler: ts.CompilerOptions
}

export interface DecoratedElement {
	tagname?: string
}

export interface CustomElement extends DecoratedElement {
	behaviors?: string[];
}

export interface Property extends DecoratedElement {
	options?: PropertyObjects
}

export interface PropertyObjects {
	type: string;
	notify?: boolean;
	readOnly?: boolean;
	reflectToAttribute?: boolean;
	computed?: string;
	observer?: string;
}

export interface Computed extends DecoratedElement {
	targets: string[];
}

export interface Observe extends DecoratedElement {
	targets: string[];
}

export interface Query extends DecoratedElement {
	selector: string;
}

export interface QueryAll extends DecoratedElement {
	selector: string;
}

export interface Listen extends DecoratedElement {
	eventName: string;
	target: string | EventTarget;
}

export enum ChangeType {
	PropertyChange,
	PropertyAddition
}
export interface PostTransformChangeRecord {
	origNode: ts.Node;
	changeType: ChangeType
	newNode: ts.Node,
	removeNode?: ts.Node,
	removeDecorator?: ts.Decorator
}
