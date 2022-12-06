import * as vscode from "vscode"
import axios from "axios"
import { execSync } from "child_process"
import { createReadStream } from "fs"
import { join } from "path"
import { getResultsFromFile } from "./common"
import { checkDeps } from "./dependency"
import { isArm, OS } from "./util"

type Project = {
  id: number
  name: string
}

type Projects = {
  projects: Project[]
}

type CustomerFields = {
  id: number
  value: string
}

type Upload = {
  token: string
  filename: string
  content_type: string
}

type AttachUpload = {
  id: number
  token: string
}

type UploadResponse = {
  upload: AttachUpload
}

type IssueStatus = {
  id: number
  name: string
}

type attachments = {
  id: number
  filename: string
}

type IssueContent = {
  id?: number
  project_id: number
  tracker_id: number
  subject: string
  is_private: boolean
  custom_fields?: CustomerFields[]
  uploads: Upload[]
  status?: IssueStatus
  attachments?: attachments[]
}

type Issue = {
  issue: IssueContent
}

const execSyncWithPath = async (cmd: string, path: string) => {
  try {
    execSync(cmd, {
      cwd: path,
    })
  } catch (e) {
    vscode.window.showErrorMessage((e as Error).message)
  }
}

const getProjectIdWithName = async (projectName: string): Promise<number> => {
  const config = vscode.workspace.getConfiguration("naivesystems")
  const redmineUrl = config.get("redmineUrl")
  const restApiKey = config.get("restApiKey")
  const url = `${redmineUrl}/projects.json?key=${restApiKey}`
  return axios
    .get(url)
    .then(function (response) {
      // handle success
      if (response.status != 200) {
        vscode.window.showErrorMessage(`cannot get the list of projects`)
        return -1
      }
      const projects: Projects = response.data
      for (let index in projects.projects) {
        if (projects.projects[index].name == projectName) {
          return projects.projects[index].id
        }
      }
      vscode.window.showErrorMessage(
        `cannot get the project named ${projectName}`
      )
      return -1
    })
    .catch(function (error: Error) {
      // handle error
      vscode.window.showErrorMessage(
        `cannot get the list of projects: ${error.message}`
      )
      return -1
    })
}

const uploadCode = async (path: string, filename: string): Promise<string> => {
  const content = createReadStream(path)
  const config = vscode.workspace.getConfiguration("naivesystems")
  const redmineUrl = config.get("redmineUrl")
  const restApiKey = config.get("restApiKey")
  const url = `${redmineUrl}/uploads.json?filename=${filename}&key=${restApiKey}`
  return axios
    .post(url, content, {
      headers: {
        "Content-Type": "application/octet-stream",
      },
    })
    .then(function (response) {
      if (response.status !== 201) {
        vscode.window.showErrorMessage(`cannot upload ${filename}`)
        return ""
      }
      const upload: UploadResponse = response.data
      if (upload.upload.id == undefined) {
        vscode.window.showErrorMessage(`cannot upload ${filename}`)
        return ""
      }
      return upload.upload.token
    })
    .catch(function (error: Error) {
      // handle error
      vscode.window.showErrorMessage(
        `cannot upload ${filename}: ${error.message}`
      )
      return ""
    })
}

const createIssue = async (issue: IssueContent): Promise<number> => {
  const req: Issue = {
    issue: issue,
  }
  const config = vscode.workspace.getConfiguration("naivesystems")
  const redmineUrl = config.get("redmineUrl")
  const restApiKey = config.get("restApiKey")
  const url = `${redmineUrl}/issues.json?key=${restApiKey}`
  return axios
    .post(url, req)
    .then(function (response) {
      if (response.status != 200 && response.status != 201) {
        vscode.window.showErrorMessage("cannot create scan task")
        return -1
      }
      const issue: Issue = response.data
      if (issue.issue.id == undefined) {
        vscode.window.showErrorMessage("cannot create scan task")
        return -1
      }
      vscode.window.showInformationMessage(
        `issue ${issue.issue.id} has been created`
      )
      return issue.issue.id
    })
    .catch(function (error: Error) {
      // handle error
      vscode.window.showErrorMessage(
        "cannot create scan task: " + error.message
      )
      return -1
    })
}

const createScanTask = async (root: string): Promise<number> => {
  vscode.window.showInformationMessage(
    "The code commited at HEAD will be compressed. Untracked or uncommited files will not be included."
  )

  const config = vscode.workspace.getConfiguration("naivesystems")
  const projectName: string | undefined = config.get("projectName")
  if (projectName === undefined) {
    vscode.window.showErrorMessage("projectName is not set in settings")
    return -1
  }
  const projID = await getProjectIdWithName(projectName)
  if (projID === -1) {
    return -1
  }

  const scanTrackerID: number | undefined = config.get("scanTrackerID")
  if (scanTrackerID === undefined) {
    vscode.window.showErrorMessage("scanTrackerID is not set in settings")
    return -1
  }
  const archiveHashID: number | undefined = config.get("archiveHashID")
  if (archiveHashID === undefined) {
    vscode.window.showErrorMessage("archiveHashID is not set in settings")
    return -1
  }

  // generate code tarball
  await execSyncWithPath(
    "git archive --format tar.gz HEAD > latest.tar.gz",
    root
  )
  const filePath = join(root, "latest.tar.gz")

  const uploadToken = await uploadCode(filePath, "latest.tar.gz")
  const upload: Upload = {
    token: uploadToken,
    filename: "latest.tar.gz",
    content_type: "text/plain",
  }
  if (uploadToken === "") {
    return -1
  }
  const uploadTokenSplit = uploadToken.split(".")
  if (uploadTokenSplit.length !== 2) {
    return -1
  }

  const hash = uploadTokenSplit[1]
  const subject = "Scan task -- archive hash: " + hash
  const archiveHash: CustomerFields = { id: archiveHashID, value: hash }

  const issue: IssueContent = {
    project_id: projID,
    tracker_id: scanTrackerID,
    subject: subject,
    is_private: false,
    custom_fields: [archiveHash],
    uploads: [upload],
  }
  await vscode.workspace.fs.delete(vscode.Uri.file(filePath))
  const id = await createIssue(issue)
  return id
}

const getIssueStatus = async (id: number): Promise<string> => {
  const config = vscode.workspace.getConfiguration("naivesystems")
  const redmineUrl = config.get("redmineUrl")
  const restApiKey = config.get("restApiKey")
  const url = `${redmineUrl}/issues/${id}.json?key=${restApiKey}`
  return axios
    .get(url)
    .then(function (response) {
      // handle success
      if (response.status != 200) {
        vscode.window.showErrorMessage(`cannot get the status of issue ${id}`)
        return "Failed"
      }
      const issue: Issue = response.data
      if (issue.issue.status === undefined) {
        vscode.window.showErrorMessage(`cannot get the status of issue ${id}`)
        return "Failed"
      }
      return issue.issue.status.name
    })
    .catch(function (error: Error) {
      // handle error
      vscode.window.showErrorMessage(
        `cannot get the status of issue ${id}: ${error.message}`
      )
      return "Failed"
    })
}

const waitForStatus = async (id: number): Promise<string> => {
  return await new Promise((resolve) => {
    const interval = setInterval(async () => {
      const status = await getIssueStatus(id)
      if (status === "Failed" || status === "Error" || status === "Resolved") {
        resolve(status)
        clearInterval(interval)
      }
    }, 1000)
  })
}

const getResultsId = async (id: number): Promise<number> => {
  const config = vscode.workspace.getConfiguration("naivesystems")
  const redmineUrl = config.get("redmineUrl")
  const restApiKey = config.get("restApiKey")
  const url = `${redmineUrl}/issues/${id}.json?include=attachments&key=${restApiKey}`
  return axios
    .get(url)
    .then(function (response) {
      // handle success
      if (response.status != 200) {
        vscode.window.showErrorMessage(`cannot get the results of issue ${id}`)
        return -1
      }
      const issue: Issue = response.data
      if (issue.issue.attachments === undefined) {
        vscode.window.showErrorMessage(`cannot get the results of issue ${id}`)
        return -1
      }
      for (let index in issue.issue.attachments) {
        if (issue.issue.attachments[index].filename === "results.zip") {
          return issue.issue.attachments[index].id
        }
      }
      vscode.window.showErrorMessage(`cannot find results.zip in issue ${id}`)
      return -1
    })
    .catch(function (error: Error) {
      // handle error
      vscode.window.showErrorMessage(
        `cannot get the results of issue ${id}: ${error.message}`
      )
      return -1
    })
}

const downloadResults = async (
  path: vscode.Uri,
  id: number
): Promise<boolean> => {
  const config = vscode.workspace.getConfiguration("naivesystems")
  const redmineUrl = config.get("redmineUrl")
  const restApiKey = config.get("restApiKey")
  const url = `${redmineUrl}/attachments/download/${id}/results.zip?key=${restApiKey}`
  return axios
    .get(url, {
      responseType: "arraybuffer",
    })
    .then(async (response) => {
      await vscode.workspace.fs.writeFile(path, response.data)
      return true
    })
    .catch(function (error: Error) {
      vscode.window.showErrorMessage(
        `cannot download from ${url}: ${error.message}`
      )
      return false
    })
}

const runWithVirtualBox = async () => {
  if (
    vscode.workspace.workspaceFolders === undefined ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    return
  }

  const id = await createScanTask(
    vscode.workspace.workspaceFolders[0].uri.fsPath
  )
  if (id === -1) {
    return
  }

  const status = await waitForStatus(id)
  if (status === "Error") {
    vscode.window.showErrorMessage(`issue ${id} failed`)
    return
  }
  vscode.window.showInformationMessage(`issue ${id} finished`)

  const resultsId = await getResultsId(id)
  if (resultsId === -1) {
    return
  }
  const resultsFile = vscode.Uri.joinPath(
    vscode.workspace.workspaceFolders[0].uri,
    "results.zip"
  )
  const success = await downloadResults(resultsFile, resultsId)
  if (!success) {
    return
  }
  vscode.window.showInformationMessage(`results.zip has been downloaded`)

  const loadZipCommand = "nsa-result-highlight.load-zip"
  const resultsList = await getResultsFromFile([resultsFile])
  vscode.commands.executeCommand(loadZipCommand, resultsList)
}

const runWithPodman = async (currentOS: OS) => {
  if (
    vscode.workspace.workspaceFolders === undefined ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    return
  }
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath
  const resultsDir = vscode.Uri.joinPath(
    vscode.workspace.workspaceFolders[0].uri,
    "output"
  )
  await vscode.workspace.fs.createDirectory(resultsDir)
  const config = vscode.workspace.getConfiguration("naivesystems")
  const imageName = config.get("imageName")
  if (imageName === undefined || imageName === "") {
    vscode.window.showErrorMessage("imageName is not set in settings")
    return
  }
  var cmd: string
  if (currentOS === OS.Linux) {
    cmd = `podman run --rm -v $PWD:/src:O -v $PWD/.naivesystems:/config:Z -v $PWD/output:/output:Z -w /src/ ${imageName} /opt/naivesystems/misra_analyzer`
  } else if (currentOS === OS.MacOS) {
    if (isArm()) {
      cmd = `podman run --rm --platform linux/amd64 -v $(pwd):/src -v $(pwd)/.naivesystems:/config -v $(pwd)/output:/output -w /src/ ${imageName} /opt/naivesystems/misra_analyzer`
    } else {
      cmd = `podman run --rm -v $(pwd):/src -v $(pwd)/.naivesystems:/config -v $(pwd)/output:/output -w /src/ ${imageName} /opt/naivesystems/misra_analyzer`
    }
  } else {
    cmd = `podman run --rm -v ${root}:/src -v ${root}\\.naivesystems:/config -v ${root}\\output:/output -w /src/ ${imageName} /opt/naivesystems/misra_analyzer`
  }

  await vscode.window.showInformationMessage(`Running ${cmd}`)
  await execSyncWithPath(cmd, root)
  const reloadCommand = "nsa-result-highlight.reload-panel"
  vscode.window.showInformationMessage(`Analyze finished`)
  vscode.commands.executeCommand(reloadCommand)
}

export const Run = async () => {
  if (
    vscode.workspace.workspaceFolders === undefined ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    vscode.window.showErrorMessage("cannot find workspace folders")
    return
  }

  const os = await checkDeps()
  if (os === undefined) {
    vscode.window.showErrorMessage("check dependency failed")
    return
  }
  if (os === OS.Linux || os === OS.MacOS) {
    await runWithPodman(os)
  } else if (os === OS.Windows7) {
    await runWithVirtualBox()
  } else {
    const config = vscode.workspace.getConfiguration("naivesystems")
    const dependency = config.get("dependency")
    if (dependency === undefined || dependency === "") {
      vscode.window.showErrorMessage("dependency is not set in settings")
      return
    }
    if (dependency === "VirtualBox") {
      await runWithVirtualBox()
    } else {
      await runWithPodman(os)
    }
  }
}
