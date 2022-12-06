// this module is used to check / select / download and install dependencies (podman / vbox)
// import and call the checkDeps function and it will handle everything
import * as vscode from "vscode"
import {
  asyncExec,
  isExecException,
  isLinux,
  isMac,
  isWindows10,
  isWindows7,
  OS,
} from "./util"
import { createWriteStream, existsSync, mkdirSync, WriteStream } from "fs"
import { get } from "http"

const CLOUD_HOSTNAME = "http://box-1305043249.cos.ap-shanghai.myqcloud.com/"
const VIRTUALBOX_6_MSI = "VirtualBox-6.0.24-r139119-MultiArch_amd64.msi"
const VIRTUALBOX_6_CAB = "common.cab"
const VIRTUALBOX_7_MSI = "VirtualBox-7.0.2-r154219.msi"

const generateMsiexecCommand = (src: string) => {
  return `msiexec.exe /i ${src} /passive /norestart`
}

enum Dependency {
  Podman = "Podman",
  VirtualBox = "VirtualBox",
}

// error used to indicate user choose to cancel the dependency check
const CANCEL_ERROR = "dependency check was cancelled by user"

// error used to indicate system authorization is not acquired
const UNAUTHORIZED_ERROR = "system authorization is not acquired"

// function to download file with a progress bar
const downloadFile = async ({
  file,
  url,
  label,
}: {
  file: WriteStream
  url: string
  label: string
}) => {
  return vscode.window.withProgress(
    {
      title: label,
      location: vscode.ProgressLocation.Notification,
    },
    (progress) => {
      return new Promise<void>((resolve, reject) => {
        get(url, (res) => {
          res.pipe(file)
          const size = parseInt(res.headers["content-length"]!)

          res.on("data", (chunk) => {
            // update progress bar
            progress.report({
              increment: (chunk.length / size) * 100,
            })
          })

          res.on("error", (error) => {
            reject(error)
          })

          file.on("finish", () => {
            file.close()
            resolve()
          })
        })
      })
    }
  )
}

const checkIsInstalled = async (dep: Dependency) => {
  try {
    switch (dep) {
      case Dependency.Podman:
        await asyncExec("podman --version")
        break
      case Dependency.VirtualBox:
        await asyncExec("vboxmanage --version")
        break
    }
    return true
  } catch (e) {
    const selection = await vscode.window.showWarningMessage(
      `需要安装 ${dep} 才可继续运行。是否安装？`,
      { title: `安装 ${dep}` },
      { title: "取消" }
    )
    if (selection?.title === `安装 ${dep}`) {
      return false
    }
    throw CANCEL_ERROR
  }
}

// function to select dependency, now it's only used for win10 to select between podman and vbox
const selectDeps = async (...deps: Dependency[]) => {
  const selection = await vscode.window.showWarningMessage(
    `可以通过 ${deps.join(" 或 ")} 运行。希望使用？`,
    ...deps.map((dep) => {
      return { title: dep }
    }),
    { title: "取消" }
  )

  if (selection?.title) {
    // store what dependency is used in extension config file
    // the third parameter indicates it's a global(true) or workspace(false) setting
    vscode.workspace
      .getConfiguration("naivesystems")
      .update("dependency", selection.title, true)

    return selection.title as Dependency
  } else {
    throw CANCEL_ERROR
  }
}

const installVirtualBox = async () => {
  if (isWindows10()) {
    return asyncExec(generateMsiexecCommand(CLOUD_HOSTNAME + VIRTUALBOX_7_MSI))
  }

  if (isWindows7()) {
    if (process.arch === "x32")
      throw "暂不支持在 32 位 Windows 7 下的 VirtualBox 一键安装"

    // create temporary directory
    const tempDir = process.env.APPDATA + "\\temp\\"
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir)
    }

    // set up write stream
    const cabFile = createWriteStream(tempDir + VIRTUALBOX_6_CAB)
    const msiFile = createWriteStream(tempDir + VIRTUALBOX_6_MSI)

    // download files
    await downloadFile({
      file: cabFile,
      url: CLOUD_HOSTNAME + VIRTUALBOX_6_CAB,
      label: `正在下载 ${Dependency.VirtualBox} 安装包: ${VIRTUALBOX_6_CAB}`,
    })
    await downloadFile({
      file: msiFile,
      url: CLOUD_HOSTNAME + VIRTUALBOX_6_MSI,
      label: `正在下载 ${Dependency.VirtualBox} 安装包: ${VIRTUALBOX_6_MSI}`,
    })

    // install virtualbox
    return asyncExec(generateMsiexecCommand(VIRTUALBOX_6_MSI), {
      cwd: tempDir,
    })
  }
}

const installPodman = async () => {
  // TODO: add podman install
  return Promise.reject("暂不支持 Podman 一键安装")
}

const installDependency = async (dep: Dependency): Promise<void> => {
  try {
    if (dep === Dependency.VirtualBox) {
      await installVirtualBox()
    }
    if (dep === Dependency.Podman) {
      await installPodman()
    }

    const selection = await vscode.window.showInformationMessage(
      "安装成功。",
      { title: "继续运行" },
      { title: "取消" }
    )
    if (selection?.title === "继续运行") {
      return
    } else {
      throw CANCEL_ERROR
    }
  } catch (e) {
    if (e === CANCEL_ERROR) {
      throw CANCEL_ERROR
    } else {
      const selection = await vscode.window.showErrorMessage(
        `${
          e === UNAUTHORIZED_ERROR
            ? "系统授权获取失败"
            : `安装失败。错误代码：${isExecException(e) ? e.code : e}`
        }`,
        { title: "重新安装" },
        { title: "取消" }
      )
      if (selection?.title === "重新安装") {
        return installDependency(dep)
      } else {
        throw CANCEL_ERROR
      }
    }
  }
}

// function to select (in win10) and check if the dependency is installed, and return the type of operating system
export const checkDeps = async (): Promise<OS | undefined> => {
  try {
    // select podman as default for linux and mac
    let dep = Dependency.Podman
    var os: OS | undefined = undefined
    if (isLinux()) {
      os = OS.Linux
    } else if (isMac()) {
      os = OS.MacOS
    } else if (isWindows10()) {
      os = OS.Windows10
      // get the dependency from config file
      const depFromConfig: Dependency | undefined = vscode.workspace
        .getConfiguration("naivesystems")
        .get("dependency")

      // if the dependency is not set, show selection modal
      if (depFromConfig) {
        dep = depFromConfig
      } else {
        dep = await selectDeps(Dependency.Podman, Dependency.VirtualBox)
      }
    } else if (isWindows7()) {
      os = OS.Windows7
      dep = Dependency.VirtualBox
    }

    // check if the dependency is installed, if not, install it
    if (!(await checkIsInstalled(dep))) {
      await installDependency(dep)
    }
    return os
  } catch (e) {
    if (e === CANCEL_ERROR) {
      throw CANCEL_ERROR
    }
  }
}
