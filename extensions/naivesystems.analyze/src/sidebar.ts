import * as vscode from "vscode"
import { isWhiteTheme } from "./common"
import IntroProvider from "./intro"

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  constructor(context: vscode.ExtensionContext, introProvider: IntroProvider) {
    this._extensionUri = context.extensionUri
    this._introProvider = introProvider
  }

  public static readonly viewType = "nsa-result-highlight.sidebar"
  private readonly _extensionUri: vscode.Uri
  private _introProvider: IntroProvider

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    // TODO: only show it at first run
    this._introProvider.showIntro()

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    }

    webviewView.webview.onDidReceiveMessage(() => {
      vscode.commands.executeCommand("nsa-result-highlight.panel.focus")
    })

    webviewView.webview.html = this._getHTML(webviewView.webview)
  }

  private _getHTML(webview: vscode.Webview) {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "sidebar.css")
    )
    const lightStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "sidebar-light.css")
    )

    return `
      <link href="${styleUri}" rel="stylesheet">
      ${isWhiteTheme() ? `<link href="${lightStyleUri}" rel="stylesheet">` : ""}
      <button>打开分析结果</button>
      <script>
        // disable right click contextmenu
        document.addEventListener('contextmenu', event => event.preventDefault());

        const vscode = acquireVsCodeApi()
        document.querySelector('button').addEventListener('click', e => {
          vscode.postMessage('open')
        })
        document.querySelector('body').tabIndex = 1;
      </script>
    `
  }
}
