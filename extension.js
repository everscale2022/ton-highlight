const vscode = require('vscode');
const { controllers } = require('tondev');
const path = require('path');
const { getErrors, getSuggestion, getCompletionItems } = require('./utils');

let _tondevTerminal;
let t_out;
let lastTime = 0;
let counter = 0
const TYPING_DELAY = 500;
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	const completionProvider = vscode.languages.registerCompletionItemProvider(
		{ scheme: 'file' },
		{
			provideCompletionItems(document, position) {
				return getCompletionItems(document);
			}
		}
	);
	context.subscriptions.push(completionProvider);

	let hoverProvider = vscode.languages.registerHoverProvider('ton-solidity', {
		provideHover(document, position) {
			const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9\.]{1,30}/);
			const word = document.getText(wordRange);
			return new vscode.Hover(getSuggestion(word));
		}
	});

	context.subscriptions.push(hoverProvider);

	const collection = vscode.languages.createDiagnosticCollection("tonsol");

	if (vscode.window.activeTextEditor) {
		updateDiagnostics(vscode.window.activeTextEditor.document, collection)
	}
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			updateDiagnostics(editor.document, collection);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(async documentChangeEvent => {
		let currTime = Date.now();
		if ((currTime - lastTime) > TYPING_DELAY) {
			counter = 0;
		}
		if (counter < 4) {//prevent when typing ...
			if (documentChangeEvent) {
				updateDiagnostics(documentChangeEvent.document, collection);
				lastTime = currTime;
			}
			counter++;
		}
	}));
}

async function updateDiagnostics(document, collection) {
	t_out = [];
	_tondevTerminal = null;
	let filePath = document.uri.fsPath;
	if (path.extname(document.uri.fsPath) !== '.sol') {
		return;
	}
	const compileCommand = controllers[1].commands[1];
	let args = [];
	args['file'] = filePath;
	args['outputDir'] = path.resolve(__dirname, 'abi');
	let r = await runCommand(compileCommand, args);

	if (r == undefined) {
		return;
	}
	let collectionSet = r.map(value => {
		let line = Math.abs(value.coord.raw - 1);
		let character = Math.abs(value.coord.position - 1);
		return {
			code: '',
			message: value.info,
			range: new vscode.Range(new vscode.Position(line, character), new vscode.Position(line, character + value.errorLenght)),
			severity: value.severity == 'Error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
			source: '',
			relatedInformation: [
				new vscode.DiagnosticRelatedInformation(new vscode.Location(document.uri, new vscode.Range(new vscode.Position(line, character), new vscode.Position(line, character + value.errorLenght))), value.info)
			]
		}
	})
	collection.set(document.uri, collectionSet);
}

async function runCommand(command, args) {
	const terminal = tondevTerminal();
	try {
		await command.run(tondevTerminal(), args);
	} catch (err) {
		terminal.writeError(err.toString());
	}
	return getErrors(t_out[0]);
}

function tondevTerminal() {
	if (!_tondevTerminal) {
		const output = vscode.window.createOutputChannel("TONDev");
		_tondevTerminal = {
			output,
			log: (...args) => {
				output.appendLine(args.map((x) => `${x}`).join(""));
			},
			writeError: (text) => {
				t_out.push(text);
			},
			write: (text) => {
				t_out.push(text);
			},
		};
	}
	return _tondevTerminal;
}

function deactivate() { }

module.exports = {
	activate,
	deactivate
}
