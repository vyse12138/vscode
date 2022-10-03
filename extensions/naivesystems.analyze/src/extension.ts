import * as vscode from "vscode"
import { Result } from "./results_pb"
import { activate as commonActivate } from "./common"
import * as pathlib from "path"

const generateResultPath = (result: Result) => {
  if (
    vscode.workspace.workspaceFolders !== undefined &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath
    return pathlib.join(
      workspaceRoot,
      result.getPath().replace(/^(\/src\/)/, "") // Remove leading `/src/`
    )
  }
  return result.getPath()
}

export function activate(context: vscode.ExtensionContext) {
  commonActivate(context, generateResultPath)
}
