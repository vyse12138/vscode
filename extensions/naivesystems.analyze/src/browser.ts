import * as vscode from "vscode"
import { Result } from "./results_pb"
import { activate as commonActivate } from "./common"

const generateResultPath = (result: Result) => {
  if (
    vscode.workspace.workspaceFolders !== undefined &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath
    const sep = workspaceRoot.substring(0, 1)
    return workspaceRoot + sep + result.getPath().replace(/^(\/src\/)/, "") // Remove leading `/src/`
  }
  return result.getPath()
}

export function activate(context: vscode.ExtensionContext) {
  commonActivate(context, generateResultPath)
}
