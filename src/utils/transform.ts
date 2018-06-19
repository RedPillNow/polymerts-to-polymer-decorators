import * as ts from 'typescript';

export class TypescriptNodeEmitter {
	updateSourceFile(sourceFile: ts.SourceFile, stmts: ts.Statement[]): [ts.SourceFile, Map<ts.Node, ts.Node>] {
		const converter = new NodeEmitterVisitor();
		const statements: ts.NodeArray<ts.Statement> = sourceFile.statements;
		const sourceStatements = [...statements];
		converter.updateSourceMap(sourceStatements);
		const newSourceFile = ts.updateSourceFileNode(sourceFile, sourceStatements);
		return [newSourceFile, converter.getNodeMap()]
	}
}

export class NodeEmitterVisitor {
	private _nodeMap = new Map<ts.Node, ts.Node>();

	updateSourceMap(stmts: ts.Statement[]) {

	}

	getNodeMap() {
		/*
		 * This will actually be a Map (TypeScript/ES6) formatted like
		 * {oldNode: newNode}
		 * This allows us to get a node from the map by passing in the node itself instead of attempting
		 * to assign it an id and keep track of the id.
		 */
		return this._nodeMap;
	}
}
