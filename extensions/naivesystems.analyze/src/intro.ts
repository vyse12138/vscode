import * as vscode from "vscode"
import { RUN_COMMAND } from "./panel"
import { checkDeps } from "./dependency"

// analyze demo workspace name
const DEMO_WORKSPACE = "analyze-demo"

export default class IntroProvider {
  config: vscode.WorkspaceConfiguration
  private readonly _extensionUri: vscode.Uri

  constructor(context: vscode.ExtensionContext) {
    this._extensionUri = context.extensionUri
    this.config = vscode.workspace.getConfiguration("naivesystems")

    // bring up the result panel if we are in the demo
    if (this.checkIsInDemo()) {
      vscode.commands.executeCommand("nsa-result-highlight.panel.focus")
    }
  }

  // function to check if we are in the analyze demo workspace
  checkIsInDemo() {
    return vscode.workspace.name?.search(DEMO_WORKSPACE) !== -1 ? true : false
  }

  hasIntroShown(): boolean {
    return this.config.get("hasIntroShown") ? true : false
  }

  async showIntro() {
    // if the user has already seen the introduction, skip it
    if (this.hasIntroShown()) return

    const selection = await vscode.window.showWarningMessage(
      "是否使用我们提供的测试代码？",
      { title: "是" },
      { title: "跳过" }
    )
    if (selection?.title === "是") {
      await checkDeps()

      // open analyze-demo in a new vscode window
      await vscode.commands.executeCommand(
        `vscode.openFolder`,
        vscode.Uri.joinPath(this._extensionUri, DEMO_WORKSPACE),
        { forceNewWindow: true }
      )
    }

    // set hasIntroShown to true to skip any further introduction
    // note: the second parameter is the actual value
    // and the third parameter indicates it's a global(true) or workspace(false) setting
    this.config.update("hasIntroShown", true, true)
  }

  renderRunDemoHTML(): string {
    if (!this.checkIsInDemo()) return ""
    return `
      <div id="demo">
        <div id="demo-top-arrow-outline"></div>
        <div id="demo-top-arrow"></div>
        点击运行demo
      </div>
    `
  }

  renderRunDemoJS(): string {
    if (!this.checkIsInDemo()) return ""
    return `
      const demo = document.getElementById('demo')
      demo.addEventListener('click', () => {
        vscode.postMessage('${RUN_COMMAND}')
        demo.hidden = true
      })
    `
  }
}
