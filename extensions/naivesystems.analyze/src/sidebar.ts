import * as vscode from "vscode"

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  constructor(context: vscode.ExtensionContext) {
    this._extensionUri = context.extensionUri
  }

  public static readonly viewType = "nsa-result-highlight.sidebar"
  private readonly _extensionUri: vscode.Uri

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
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

    return `
      <link href="${styleUri}" rel="stylesheet">
      <button>打开分析结果</button>
      <script>
        const vscode = acquireVsCodeApi()
        document.querySelector('button').addEventListener('click', e => {
          vscode.postMessage('open')
        })
        document.querySelector('body').tabIndex = 1;
      </script>
    `
  }
}
