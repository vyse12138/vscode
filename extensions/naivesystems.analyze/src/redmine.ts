import * as vscode from "vscode"
import { exec } from "child_process"
import { createHash } from "crypto"
import { createReadStream } from "fs"
import { join } from "path"

const getFileMD5 = (filePath: string): Promise<string> => {
  return new Promise((resolve) => {
    const fd = createReadStream(filePath)
    const md5 = createHash("md5").setEncoding("hex")
    fd.on("data", function (data) {
      md5.update(data)
    })
    fd.on("end", function () {
      const hash = md5.digest("hex")
      return resolve(hash)
    })
  })
}

const createScanTask = async (root: string) => {
  vscode.window.showInformationMessage(
    "The code commited at HEAD will be compressed. Untracked or uncommited files will not be concluded."
  )

  exec(
    "git archive -o latest.tar.gz HEAD",
    {
      cwd: root,
    },
    (err, stderr) => {
      if (err) {
        vscode.window.showErrorMessage(stderr)
        return
      }
    }
  )

  const filePath = join(root, "latest.tar.gz")
  const hash = await getFileMD5(filePath)
  const newFilePath = join(root, hash + ".tar.gz")
  await vscode.workspace.fs.rename(
    vscode.Uri.file(filePath),
    vscode.Uri.file(newFilePath),
    {
      overwrite: true,
    }
  )
}

export const Run = async () => {
  if (
    vscode.workspace.workspaceFolders === undefined ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    vscode.window.showErrorMessage("cannot find workspace folders")
    return
  }
  createScanTask(vscode.workspace.workspaceFolders[0].uri.fsPath)
}
