export enum PolymerDecorators {
	CUSTOMELEMENT = '@customElement',
	PROPERTY = '@property',
	COMPUTED = '@computed',
	OBSERVE = '@observe',
	QUERY = '@query',
	QUERYALL = '@queryAll',
	LISTEN = '@listen'
}

export type CustomElement = {
	tagname?: string
}

export type Property = {
	options?: PropertyObjects
}

export type PropertyObjects = {
	type: string,
	notify?: boolean,
	readOnly?: boolean,
	reflectToAttribute?: boolean,
	computed?: string,
	observer?: string
}

export type Computed = {
	targets: string[]
}

export type Observe = {
	targets: string[]
}

export type Query = {
	selector: string
}

export type QueryAll = {
	selector: string
}

export type Listen = {
	eventName: string,
	target: string | EventTarget
}
