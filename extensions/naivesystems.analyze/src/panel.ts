import * as vscode from "vscode"
import {
  generateResultPath,
  getFileLocation,
  importResultsFromZip,
  reloadResultsFiles,
} from "./common"
import { Result } from "./results_pb"
import { ruleCategoryMap } from "./results_tree"
export const panelResultData: any[] = []

interface ResultData {
  issueCode: string
  severity: string
  specification: string
  rule: string
  category: string
  errorMsg: string
  location: string
  locationData: {
    filePath: string
    lineNumber: number
  }
}

interface UnknownResultData {
  errorMsg: string
  location: string
  locationData: {
    filePath: string
    lineNumber: number
  }
}

const RULE_PREFIX = "Rule "

const severityMap = new Map<number, string>()
severityMap.set(1, "最高")
severityMap.set(2, "高")
severityMap.set(3, "中")
severityMap.set(4, "低")
severityMap.set(5, "最低")
severityMap.set(0, "未定义")

const categoryMap = new Map<string, string>()
categoryMap.set("mandatory", "强制")
categoryMap.set("required", "要求")
categoryMap.set("advisory", "建议")

const specificationMap = new Map<string, string>()
specificationMap.set("misra-c2012", "MISRA C:2012")

export class PanelViewProvider implements vscode.WebviewViewProvider {
  constructor(context: vscode.ExtensionContext) {
    this._extensionUri = context.extensionUri
    this._subscriptions = context.subscriptions
  }

  public static readonly viewType = "nsa-result-highlight.panel"
  private readonly reloadCommand = "nsa-result-highlight.reload-panel"
  private readonly importZipCommand =
    "nsa-result-highlight.import-results-from-zip"
  private readonly _extensionUri: vscode.Uri
  private _subscriptions: vscode.Disposable[]
  private _firstRun = true

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    }
    webviewView.webview.html = await this._getHTML(webviewView.webview)
    // the second argument represents the 'this' argument when calling the event
    // since we are not using 'this' in the callback, we leave it as 'undefined'
    webviewView.webview.onDidReceiveMessage(
      (msg) => {
        vscode.commands.executeCommand(
          "nsa-result-highlight.jump_to",
          JSON.parse(msg)
        )
      },
      undefined,
      this._subscriptions
    )

    if (this._firstRun) {
      this._subscriptions.push(
        vscode.commands.registerCommand(
          this.importZipCommand,
          async (uri: vscode.Uri) => {
            webviewView.webview.html = await this._getHTMLFromZip(
              webviewView.webview,
              uri
            )
          }
        )
      )
      this._subscriptions.push(
        vscode.commands.registerCommand(this.reloadCommand, async () => {
          webviewView.webview.html = await this._getHTML(webviewView.webview)
        })
      )
      this._firstRun = false
    }
  }

  private async _updatePanel(
    webview: vscode.Webview,
    resultsList: (Result | undefined)[]
  ) {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "panel.css")
    )
    const arrowUpUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "arrow-up.svg")
    )
    const arrowDownUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "arrow-down.svg")
    )
    const results: ResultData[] = []
    const unknownResults: UnknownResultData[] = []
    const specifications = new Set<string>()

    for (const result of resultsList) {
      if (!result) continue

      const locationData = {
        filePath: generateResultPath(result),
        lineNumber: result.getLineNumber(),
      }
      const location = getFileLocation(result)

      // e.g. error_message could be '[C0302][misra-c2012-19.1]: there is an error'
      // note, the colon was removed in newer version e.g. '[C0302][misra-c2012-19.1] error'
      // then issueCode is [C0302], specification is 'MISRA C2012',
      // rule is 'Rule 19.1', and errorMsg is 'there is an error'
      const matches = result
        .getErrorMessage()
        .match(/\[([^\]]*)\]\[([^\]]*)\-([^\]]*)\]:? (.*)/s)

      const severityInResult = severityMap.get(result.getSeverity())
      const severity = severityInResult ? severityInResult : "未定义"

      // if the errorMsg is not in the expected format, we add it to unknownResults
      if (
        !matches ||
        !matches[1] ||
        !matches[2] ||
        !matches[3] ||
        !matches[4]
      ) {
        unknownResults.push({
          errorMsg: result.getErrorMessage(),
          location,
          locationData,
        })
        continue
      }

      const issueCode = matches[1]
      const specification = specificationMap.get(matches[2]) ?? matches[2]
      const rule = RULE_PREFIX + matches[3]
      const errorMsg = matches[4]
      // record specification
      specifications.add(specification)
      // iterate thru ruleCategoryMap to get the current category
      let category = "mandatory"
      for (const [categoryKey, categoryValue] of ruleCategoryMap) {
        for (const categoryRule of categoryValue) {
          if (matches[3] === categoryRule.match(/(.*)-(.*)-(.*)/)?.[3]) {
            category = categoryKey
          }
        }
      }
      category = categoryMap.get(category)!

      results.push({
        issueCode,
        severity,
        specification,
        rule,
        category,
        errorMsg,
        location,
        locationData,
      })
    }

    return `
      <link href="${styleUri}" rel="stylesheet">
      <div class="top">
        <div class="filter">
          <div>严重程度</div>
          <select class="select" name="severity" id="severity">
            <option value="">全部</option>
            <option value="最高">最高</option>
            <option value="高">高</option>
            <option value="中">中</option>
            <option value="低">低</option>
            <option value="最低">最低</option>
            <option value="未定义">未定义</option>
          </select>

          <div>规范</div>
          <select class="select" name="specification" id="specification">
            <option value="">全部</option>
          </select>

          <div>类别</div>
          <select class="select" name="category" id="category">
            <option value="">全部</option>
            <option value="强制">强制</option>
            <option value="要求">要求</option>
            <option value="建议">建议</option>
          </select>

          <input
            type="text"
            id="search"
            placeholder="筛选器 (例如 Rule 8.2,  demo.c)"
          />
        </div>
        <table id="'result-table">
          <thead>
            <tr id="results-head" class="head">
              <td class="ceil pointer" id="issueCode-order">
                <div class="truncate">
                  错误代码<img class="arrow" id="issueCode-arrow" src="${arrowDownUri}" />
                </div>
              </td>
              <td class="ceil pointer" id="severity-order">
                <div class="truncate">
                  严重程度<img class="arrow" id="severity-arrow" src="${arrowDownUri}" />
                </div>
              </td>
              <td class="ceil w-96"><div class="truncate">规范</div></td>
              <td class="ceil pointer" id="rule-order">
                <div class="truncate">
                  规则<img class="arrow" id="rule-arrow" src="${arrowDownUri}" />
                </div>
              </td>
              <td class="ceil pointer" id="category-order">
                <div class="truncate">
                  类别<img class="arrow" id="category-arrow" src="${arrowDownUri}" />
                </div>
              </td>
              <td class="ceil w-full"><div class="truncate">错误信息</div></td>
              <td class="ceil w-128 pointer" id="location-order">
                <div class="truncate">
                  文件位置<img class="arrow" id="location-arrow" src="${arrowDownUri}" />
                </div>
              </td>
            </tr>
          </thead>
          <tbody id="results"></tbody>
        </table>
      <div id="unknown-results" class="display-none">
        <div class="head">未知错误信息</div>
      </div>
      <script>
        const vscode = acquireVsCodeApi()

        // disable right click contextmenu
        document.addEventListener('contextmenu', event => event.preventDefault());

        // only add recorded specifications to the select
        const specifications = ${JSON.stringify(Array.from(specifications))}
        const specificationSelect = document.getElementById('specification')
        for (const specification of specifications){
          const opt = document.createElement('option');
          opt.value = specification;
          opt.innerText = specification;
          specificationSelect.appendChild(opt);
        }

        // when there are unknownResults, we render them
        const unknownResults = ${JSON.stringify(unknownResults)}
        if (unknownResults.length > 0) {
          const unknownResultsContainer = document.getElementById('unknown-results')
          unknownResultsContainer.classList.remove('display-none')
          for (const result of unknownResults) {
            unknownResultsContainer.innerHTML += \`
              <div class="row" tabindex="0" data-location=\${JSON.stringify(result.locationData)}>
                <div class="ceil grow">\${result.errorMsg}</div>
                <div class="ceil w-128">\${result.location}</div>
              </div>
            \`
          }
        }

        let results = ${JSON.stringify(results)}
        const container = document.getElementById('results')
        const filterOptions = {
          severity: '',
          specification: '',
          category: ''
        }
        let resultsHTML = ''

        const addResultToHTML = (result, keyword) => {
          const keywordReg = new RegExp(keyword, 'sg')

          // return if there's a keyword and it's not found
          if (keyword) {
            let matchFound = false
            for (const key in result) {
              if (key !== 'locationData' && result[key].match(keywordReg)) matchFound = true
            }
            if (!matchFound) return
          }

          const highlightKeyword = data =>
            data.replace(
              keywordReg,
              match => \`<span class="keyword">\${match}</span>\`
            )

          resultsHTML += \`
                <tr class="row focused" tabindex="0" data-location=\${JSON.stringify(result.locationData)} >
                  <td class="ceil">\${highlightKeyword(result.issueCode)}</td>
                  <td class="ceil">\${highlightKeyword(result.severity)}</td>
                  <td class="ceil w-96">\${highlightKeyword(result.specification)}</td>
                  <td class="ceil">\${highlightKeyword(result.rule)}</td>
                  <td class="ceil">\${highlightKeyword(result.category)}</td>
                  <td class="ceil w-full">\${highlightKeyword(result.errorMsg)}</td>
                  <td class="ceil w-128">\${highlightKeyword(result.location)}</td>
                </tr>
              \`
        }

        const addJumpToFileListener = () => {
          for (const row of document.getElementsByClassName('row')) {
            row.addEventListener('click', e => {
              vscode.postMessage(e.currentTarget.dataset.location)
            })
          }
        }

        const renderHTML = (keyword) => {
          resultsHTML = ''
          for (const result of results) {
            if (
              (!filterOptions.category ||
                result.category === filterOptions.category) &&
              (!filterOptions.severity ||
                result.severity === filterOptions.severity) &&
              (!filterOptions.specification ||
                result.specification === filterOptions.specification)
            ) {
              addResultToHTML(result, keyword)
            }
          }
          container.innerHTML = resultsHTML
          addJumpToFileListener()
        }
        renderHTML()

        ;['category', 'severity', 'specification'].map(id =>
          document.getElementById(id).addEventListener('change', e => {
            filterOptions[e.target.name] = e.target.value
            renderHTML()
          })
        )

        const orderMap = new Map()
        const severity = {
          highest: 1,
          high: 2,
          medium: 3,
          low: 4,
          lowest: 5,
          unknown: 6
        }
        orderMap.set('最高', severity.highest)
        orderMap.set('高', severity.high)
        orderMap.set('中', severity.medium)
        orderMap.set('低', severity.low)
        orderMap.set('最低', severity.lowest)
        orderMap.set('未定义', severity.unknown)
        orderMap.set('强制', severity.highest)
        orderMap.set('要求', severity.high)
        orderMap.set('建议', severity.medium)
        const orderUp = {
          severity: false,
          category: false
        }

        // function used when sorting by location
        const compareLocation = (l1, l2) => {
          const [l1File, l1Line] = l1.split(':')
          const [l2File, l2Line] = l2.split(':')
          // compare by file name
          if (l1File !== l2File) return l1File.localeCompare(l2File)
          // if file name is the same, compare by line number
          return parseInt(l1Line) - parseInt(l2Line)
        }

        // function used when sorting by rule
        const compareRule = (rule1, rule2) => {
          // remove the rule prefix
          const num1 = parseFloat(rule1.slice(${RULE_PREFIX.length}))
          const num2 = parseFloat(rule2.slice(${RULE_PREFIX.length}))
          return num1 - num2
        }

        ;['issueCode', 'category', 'severity', 'rule', 'location'].map(id =>
          document.getElementById(\`\${id}-order\`).addEventListener('click', e => {
            document.getElementById(\`\${id}-arrow\`).src = orderUp[id]
              ? "${arrowDownUri}"
              : "${arrowUpUri}"
            results = results.sort((r1, r2) => {
              if (id === 'location') {
                return orderUp[id]
                  ? compareLocation(r2[id], r1[id])
                  : compareLocation(r1[id], r2[id])
              }
              if (id === 'issueCode') {
                return orderUp[id]
                  ? r2[id].localeCompare(r1[id])
                  : r1[id].localeCompare(r2[id])
              }
              if (id === 'rule') {
                return orderUp[id]
                  ? compareRule(r2[id], r1[id])
                  : compareRule(r1[id], r2[id])
              }
              const s1 = orderMap.get(r1[id])
              const s2 = orderMap.get(r2[id])
              return orderUp[id] ? s1 - s2 : s2 - s1
            })
            orderUp[id] = !orderUp[id]
            renderHTML()
          })
        )

        const debounce = (callback, gap) => {
          let timeout = null
          return (...args) => {
            clearTimeout(timeout)
            timeout = setTimeout(() => {
              callback(...args)
            }, gap)
          }
        }
        document.getElementById('search').addEventListener(
          'input',
          debounce(e => {
            renderHTML(e.target.value)
          }, 250)
        )

        // retrieve all headings in results table
        const heads = document.querySelectorAll('#results-head .ceil')

        for (let i = 0; i < heads.length - 1; i++) {
          // create a dragger between each columns
          const drag = document.createElement('div')
          drag.classList.add('drag')
          drag.style.height = window.getComputedStyle(
            document.querySelector('table')
          ).height

          const [left, right] = [heads[i], heads[i + 1]]
          left.appendChild(drag)

          let clientX = 0
          let leftWidth = 0
          let rightWidth = 0

          drag.addEventListener('click', e => {
            // stop propagation to prevent triggering sort click event
            e.stopPropagation()
          })

          drag.addEventListener('mousedown', e => {
            // record the current mouse position and the width of left / right column
            clientX = e.clientX
            leftWidth = parseInt(window.getComputedStyle(left).width)
            rightWidth = parseInt(window.getComputedStyle(right).width)

            // add drag handler and mouse up handler
            document.addEventListener('mousemove', mouseMoveHandler)
            document.addEventListener('mouseup', mouseUpHandler)
          })

          const mouseMoveHandler = e => {
            // calculate how far the mouse has been moved
            const dx = e.clientX - clientX

            // Update the width of the left and right columns
            if (leftWidth + dx > 0 && rightWidth - dx > 0) {
              left.style.width = leftWidth + dx + 'px'
              right.style.width = rightWidth - dx + 'px'
            }
          }

          const mouseUpHandler = () => {
            document.removeEventListener('mousemove', mouseMoveHandler)
            document.removeEventListener('mouseup', mouseUpHandler)
          }
        }
      </script>
    `
  }

  private async _getHTML(webview: vscode.Webview) {
    const resultList = await reloadResultsFiles()
    return await this._updatePanel(webview, resultList)
  }

  private async _getHTMLFromZip(webview: vscode.Webview, uri: vscode.Uri) {
    const resultList = await importResultsFromZip(uri)
    return await this._updatePanel(webview, resultList)
  }
}
