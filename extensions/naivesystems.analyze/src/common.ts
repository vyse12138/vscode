import * as vscode from "vscode"
import { Buffer } from "buffer"
import { Result, ResultsList } from "./results_pb"
import { Location, ruleLocationsMap } from "./results_tree"
import { PanelViewProvider } from "./panel"
import { SidebarViewProvider } from "./sidebar"
import { Run } from "./redmine"
import * as AdmZip from "adm-zip"

var sha1 = require("js-sha1")

export let generateResultPath = (result: Result) =>
  result.getPath().replace(/^(\/src\/)/, "")

// e.g. filename: demo.c, line number: 8 => 'demo.c: 8'
export const getFileLocation = (result: Result) =>
  result.getPath().slice(result.getPath().lastIndexOf("/") + 1) +
  ":" +
  result.getLineNumber()

const diagnosticCollection =
  vscode.languages.createDiagnosticCollection("nsa-result")

export const results: Map<string, Map<number, Array<string>>> = new Map()

interface Suppression {
  path: string
  line_number: number
  content: string
  rule_code: string
}

interface SuppressionsList {
  suppressions: Suppression[]
}

let suppresionsList: SuppressionsList = { suppressions: [] }

const getResults = (resultsData: Uint8Array) => {
  const resultsList = ResultsList.deserializeBinary(resultsData)
  for (const result of resultsList.getResultsList()) {
    const resultPath = generateResultPath(result)
    const locationMessageMap =
      results.get(resultPath) ?? new Map<number, Array<string>>()
    const lineResultsList = locationMessageMap.get(result.getLineNumber()) ?? []
    lineResultsList.push(result.getErrorMessage())
    locationMessageMap.set(result.getLineNumber(), lineResultsList)
    results.set(resultPath, locationMessageMap)
    const errMsg = result.getErrorMessage()
    const rule = errMsg.substring(0, errMsg.indexOf(":"))
    const ruleLocations = ruleLocationsMap.get(rule) ?? []
    ruleLocations.push({
      filePath: resultPath,
      lineNumber: result.getLineNumber(),
    })
    ruleLocationsMap.set(rule, ruleLocations)
  }
  return resultsList.getResultsList()
}

const readResultsFile = async (
  uri: vscode.Uri
): Promise<Result[] | undefined> => {
  if (
    vscode.workspace.workspaceFolders !== undefined &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    const resultsData = await vscode.workspace.fs.readFile(uri)
    console.debug("Loading results from " + uri)
    try {
      getResults(resultsData)
    } catch (error) {
      console.error(error)
    }
    return ResultsList.deserializeBinary(resultsData).getResultsList()
  }
}

const getLineRange = (lineNumber: number) => {
  const activeEditor = vscode.window.activeTextEditor
  if (activeEditor) {
    return activeEditor.document.lineAt(lineNumber - 1).range
  }
}

const getCodeFromErrorMessage = (errorMessage: string) => {
  const matchedCode = errorMessage.match(/\[\w+\d+\]/g)?.[0]
  if (!matchedCode) return undefined
  const code = matchedCode.substring(1, matchedCode.length - 1)
  return {
    value: code,
    target: vscode.Uri.parse(`https://docs.naivesystems.com/analyze/${code}`),
  }
}

const getLocationsFromErrorMessage = (errorMessage: string) => {
  let locations: vscode.Location[] = []
  let paths: string[] = []
  if (
    vscode.workspace.workspaceFolders === undefined ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    return { locations: locations, paths: paths }
  }
  const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath
  const matches = [
    ...errorMessage.matchAll(/((\/[^/ \s]*)+\/?:\d+:\d+|(\/[^/ \s]*)+\/?)/g),
  ]
  matches.forEach((matchedGroup) => {
    const matchedPath = matchedGroup[0]
    paths.push(matchedPath)
    // matches `/src/FreeRTOS/Source/include/task.h:2701:1`
    const regexWithLine = /((\/[^/ \s]*)+\/?):(\d+):(\d+)/g
    if (matchedPath.match(regexWithLine)) {
      let matches
      while ((matches = regexWithLine.exec(matchedPath)) !== null) {
        if (matches.index === regexWithLine.lastIndex) {
          regexWithLine.lastIndex++
        }
        const filePath = matches[1].replace(/^(\/src\/)/, "")
        const lineCount = matches[3]
        const wordCount = matches[4]
        const path = vscode.Uri.joinPath(
          vscode.Uri.file(workspaceRoot),
          filePath
        )
        locations.push(
          new vscode.Location(
            path,
            new vscode.Position(
              parseInt(lineCount) - 1,
              parseInt(wordCount) - 1
            )
          )
        )
      }
    } else {
      // matches `/src/FreeRTOS/Source/include/task.h` only
      const regexWithoutLine = /((\/[^/ \s]*)+\/?)/g
      let matches
      while ((matches = regexWithoutLine.exec(matchedPath)) !== null) {
        if (matches.index === regexWithoutLine.lastIndex) {
          regexWithoutLine.lastIndex++
        }
        const filePath = matches[1].replace(/^(\/src\/)/, "")
        const path = vscode.Uri.joinPath(
          vscode.Uri.file(workspaceRoot),
          filePath
        )
        locations.push(new vscode.Location(path, new vscode.Position(0, 0)))
      }
    }
  })
  return { locations: locations, paths: paths }
}

let allFileResultsListMap: Map<string, Map<number, Array<string>>> = new Map()

const getFileResultsListMap = (filename: string) => {
  if (allFileResultsListMap.get(filename) !== undefined)
    return allFileResultsListMap.get(filename)!
  const fileResult = results.get(filename)
  const fileResultsList: Map<number, Array<string>> = new Map()
  if (!fileResult) return fileResultsList
  for (const line of fileResult.keys()) {
    const errorMessages = fileResult.get(line)
    if (errorMessages) {
      const lineResultsList = fileResultsList.get(line) ?? []
      fileResultsList.set(line, lineResultsList.concat(errorMessages))
    }
  }
  allFileResultsListMap.set(filename, fileResultsList)
  return fileResultsList
}

const updateDiagnostics = (textDocument: vscode.TextDocument) => {
  const diagnostics: vscode.Diagnostic[] = []
  const fileResultsList = getFileResultsListMap(textDocument.fileName)
  for (const line of fileResultsList.keys()) {
    const range = getLineRange(line)
    const errorMessages = fileResultsList.get(line)
    if (range && errorMessages) {
      errorMessages.forEach((errorMessage) => {
        const { locations, paths } = getLocationsFromErrorMessage(errorMessage)
        let cleanedErrorMessage = errorMessage
        paths.forEach((path) => {
          const escapeRegexpPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          cleanedErrorMessage = cleanedErrorMessage.replace(
            new RegExp(escapeRegexpPath),
            path.substring("/src/".length)
          )
        })
        diagnostics.push({
          // TODO: may need to change severity
          severity: vscode.DiagnosticSeverity.Error,
          range: range,
          message: cleanedErrorMessage,
          code: getCodeFromErrorMessage(errorMessage),
          relatedInformation: locations.map(
            (location) =>
              new vscode.DiagnosticRelatedInformation(
                location,
                "related location"
              )
          ),
        })
      })
    }
  }
  diagnosticCollection.set(textDocument.uri, diagnostics)
}

const updateReultsView = () => {
  if (vscode.window.activeTextEditor) {
    // Update diagnostics if a file has been open while extension is activating
    updateDiagnostics(vscode.window.activeTextEditor.document)
  }
}

export const reloadResultsFiles = async (): Promise<(Result | undefined)[]> => {
  // TODO(chenshi): Currently all results are forced to reload, should reload on demand.
  results.clear()
  ruleLocationsMap.clear()
  allFileResultsListMap.clear()
  return vscode.workspace
    .findFiles("**/*.nsa_results")
    .then((resultsFileUris) =>
      Promise.all(
        resultsFileUris.map(async (uri) => await readResultsFile(uri))
      ).then((resultsList) => {
        updateReultsView()
        return resultsList.flat(1)
      })
    )
}

const readSuppressionFile = async (uri: vscode.Uri) => {
  const resultsData = await vscode.workspace.fs.readFile(uri)
  suppresionsList = JSON.parse(resultsData.toString())
}

const reloadSuppresionsFile = async (
  workspaceRoot: string,
  ruleCode: string
) => {
  let workspaceRootSplit: string[]
  if (process.platform == "win32") {
    workspaceRootSplit = workspaceRoot.split("\\")
  } else {
    workspaceRootSplit = workspaceRoot.split("/")
  }
  const projectName = ruleCode.includes("SEC")
    ? "secrets"
    : workspaceRootSplit[workspaceRootSplit.length - 1]
  let suppresionFile = projectName + ".nsa_suppression"
  let suppressionPath: vscode.Uri = vscode.Uri.parse("")
  suppresionsList = { suppressions: [] }
  const suppressionFileUris = await vscode.workspace.findFiles(
    ".naivesystems/suppression/" + suppresionFile
  )
  if (suppressionFileUris.length == 0) {
    const defaultSuppressionDir = vscode.Uri.joinPath(
      vscode.Uri.file(workspaceRoot),
      ".naivesystems/suppression"
    )
    vscode.workspace.fs.createDirectory(defaultSuppressionDir)
    suppressionPath = vscode.Uri.joinPath(defaultSuppressionDir, suppresionFile)
  } else {
    suppressionPath = suppressionFileUris[0]
    await readSuppressionFile(suppressionPath)
  }
  return suppressionPath
}

const writeSuppressionFile = async (
  suppressionPath: vscode.Uri,
  filePath: string,
  lineNumber: number,
  content: string,
  ruleCode: string
) => {
  const suppresion: Suppression = {
    path: filePath,
    line_number: lineNumber,
    content: content,
    rule_code: ruleCode,
  }
  suppresionsList.suppressions.push(suppresion)
  const writeContent = JSON.stringify(suppresionsList, null, 2)
  await vscode.workspace.fs.writeFile(
    suppressionPath,
    Buffer.from(writeContent, "utf-8")
  )
  vscode.window.showInformationMessage("Successfully add suppression")
}

const addSuppresionToFile = async (
  filePath: string,
  lineNumber: number,
  content: string,
  ruleCode: string,
  workspaceRoot: string
) => {
  const suppressionPath = await reloadSuppresionsFile(workspaceRoot, ruleCode)
  await writeSuppressionFile(
    suppressionPath,
    filePath,
    lineNumber,
    content,
    ruleCode
  )
}

export const importResultsFromZip = async (
  uri: vscode.Uri
): Promise<(Result | undefined)[]> => {
  return vscode.window
    .showOpenDialog({
      filters: {
        "Zip files": ["zip"],
      },
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: uri,
      openLabel: "select zip files",
    })
    .then((fileUri) => {
      if (fileUri && fileUri[0]) {
        const zipUri = fileUri[0]
        const zip = new AdmZip(zipUri.fsPath)
        const buf = zip.readFile("results.nsa_results")
        if (buf !== null) {
          results.clear()
          ruleLocationsMap.clear()
          allFileResultsListMap.clear()
          const resultsData = new Uint8Array(buf)
          const resultsList = getResults(resultsData)
          updateReultsView()
          return resultsList
        } else {
          vscode.window.showInformationMessage("Fail to find results files")
          return []
        }
      }
      return []
    })
}

export function activate(
  context: vscode.ExtensionContext,
  generateFunc: (result: Result) => string
) {
  generateResultPath = generateFunc
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      reloadResultsFiles()
    })
  )
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.nsa_results")
  context.subscriptions.push(
    watcher.onDidChange(() => {
      reloadResultsFiles()
    })
  )
  context.subscriptions.push(
    watcher.onDidCreate(() => {
      reloadResultsFiles()
    })
  )
  context.subscriptions.push(
    watcher.onDidDelete(() => {
      reloadResultsFiles()
    })
  )
  console.debug("reloadResultsFiles")
  reloadResultsFiles()
  console.debug(
    `reloadResultsFiles done, results.size: ${results.size}, ruleLocationsMap.size: ${ruleLocationsMap.size}`
  )

  vscode.window.registerWebviewViewProvider(
    "nsa-result-highlight.panel",
    new PanelViewProvider(context),
    { webviewOptions: { retainContextWhenHidden: true } }
  )

  vscode.window.registerWebviewViewProvider(
    "nsa-result-highlight.sidebar",
    new SidebarViewProvider(context),
    { webviewOptions: { retainContextWhenHidden: true } }
  )

  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document)
  }
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDiagnostics(editor.document)
      }
    })
  )

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((textDocument) =>
      diagnosticCollection.delete(textDocument.uri)
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "nsa-result-highlight.jump_to",
      (location: Location) => {
        const openPath = vscode.Uri.file(location.filePath)
        vscode.workspace.openTextDocument(openPath).then((doc) => {
          if (doc) {
            vscode.window.showTextDocument(doc).then((e) => {
              e.selection = new vscode.Selection(
                new vscode.Position(0, 0),
                new vscode.Position(0, 0)
              )
              vscode.commands.executeCommand("cursorMove", {
                to: "down",
                by: "line",
                value: location.lineNumber - 1,
              })
            })
          } else {
            vscode.window.showInformationMessage(
              "Fail to open " + location.filePath
            )
          }
        })
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "nsa-result-highlight.reload-results-files",
      () => {
        vscode.window.showInformationMessage("Reloading results files...")
        reloadResultsFiles()
      }
    )
  )

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { pattern: "**" },
      new SourceLinker(),
      {
        providedCodeActionKinds: SourceLinker.providedCodeActionKinds,
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("Suppression", addSuppresionToFile)
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("nsa-result-highlight.run", Run)
  )

  console.debug("nsa extension activated")
}

export interface ErrorInfo {
  ruleCode: string
  lineNumber: number
}

export class SourceLinker implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ]

  private getNsaResults(
    document: vscode.TextDocument,
    range: vscode.Range
  ): ErrorInfo[] {
    const fileResultsList = getFileResultsListMap(document.fileName)
    let errorList: ErrorInfo[] = []
    for (const lineNumber of fileResultsList.keys()) {
      const lineRange = document.lineAt(lineNumber - 1).range
      const errorMessages = fileResultsList.get(lineNumber) || []
      if (errorMessages.length == 0) {
        continue
      }
      errorMessages.forEach((errorMessage) => {
        const matchedCode = errorMessage.match(/\[\w+\d+\]/g)?.[0]
        let code = matchedCode
          ? matchedCode.substring(1, matchedCode.length - 1)
          : ""
        if (code != "" && lineRange.contains(range))
          errorList.push({ ruleCode: code, lineNumber: lineNumber })
      })
    }
    return errorList
  }

  private addSuppresion(
    filePath: string,
    lineNumber: number,
    content: string,
    ruleCode: string,
    workspaceRoot: string
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      `Suppress the violation of ${ruleCode} at line ${lineNumber}`,
      vscode.CodeActionKind.QuickFix
    )
    action.command = {
      command: "Suppression",
      title: "Suppression",
      arguments: [filePath, lineNumber, content, ruleCode, workspaceRoot],
    }
    return action
  }

  private createSuppresions(
    errorList: ErrorInfo[],
    document: vscode.TextDocument
  ): vscode.CodeAction[] {
    if (
      vscode.workspace.workspaceFolders === undefined ||
      vscode.workspace.workspaceFolders.length === 0
    ) {
      return []
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath
    let actionList: vscode.CodeAction[] = []
    errorList.forEach((error) => {
      const lineNumber = error.lineNumber
      const ruleCode = error.ruleCode
      const text = document.lineAt(lineNumber - 1).text.trim()
      const content: string = sha1(text)
      const action = this.addSuppresion(
        document.fileName,
        lineNumber,
        content.substring(0, 16),
        ruleCode,
        workspaceRoot
      )
      actionList.push(action)
    })
    return actionList
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] | undefined {
    const errorList = this.getNsaResults(document, range)
    if (errorList.length == 0) return []
    const suppresionActions = this.createSuppresions(errorList, document)
    return [...suppresionActions]
  }
}
