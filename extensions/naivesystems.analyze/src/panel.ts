import * as vscode from "vscode"
import {
  generateResultPath,
  getFileLocation,
  importResultsFromZip,
  isWhiteTheme,
  reloadResultsFiles,
} from "./common"
import IntroProvider from "./intro"
import { Result } from "./results_pb"
import { ruleCategoryMap } from "./results_tree"
export const panelResultData: any[] = []
export const RUN_COMMAND = "run-command"

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

// function to split string in half at the first separator encountered
const splitOnce = (str: string, sep: string) => {
  const i = str.indexOf(sep)
  if (i === -1) {
    // not found
    return [str, ""]
  }
  return [str.slice(0, i), str.slice(i + 1)]
}

const RULE_PREFIX = "Rule "
const DIR_PREFIX = "Dir "

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
specificationMap.set("misra-cpp2008", "MISRA C++:2008")
specificationMap.set("gjb-5369", "GJB 5369")
specificationMap.set("gjb-8114", "GJB 8114")

export class PanelViewProvider implements vscode.WebviewViewProvider {
  constructor(context: vscode.ExtensionContext, introProvider: IntroProvider) {
    this._extensionUri = context.extensionUri
    this._subscriptions = context.subscriptions
    this._introProvider = introProvider
  }

  public static readonly viewType = "nsa-result-highlight.panel"
  private readonly reloadCommand = "nsa-result-highlight.reload-panel"
  private readonly importZipCommand =
    "nsa-result-highlight.import-results-from-zip"
  private readonly loadZipCommand = "nsa-result-highlight.load-zip"
  private readonly _extensionUri: vscode.Uri
  private _subscriptions: vscode.Disposable[]
  private _introProvider: IntroProvider
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
        if (msg === RUN_COMMAND) {
          vscode.commands.executeCommand("nsa-result-highlight.run")
          return
        }
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
      this._subscriptions.push(
        vscode.commands.registerCommand(
          this.loadZipCommand,
          async (resultsList: (Result | undefined)[]) => {
            webviewView.webview.html = await this._updatePanel(
              webviewView.webview,
              resultsList
            )
          }
        )
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
    const lightStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "panel-light.css")
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
      // or '[C0302][misra-c2012-dir-4.10]: there is an error'
      // note, the colon was removed in newer version e.g. '[C0302][misra-c2012-19.1] error'
      // then issueCode is [C0302], specification is 'MISRA C2012',
      // rule is 'Rule 19.1', and errorMsg is 'there is an error'
      const m0 = result.getErrorMessage()
      const [, m1] = splitOnce(m0, "[")
      const [issueCode, m2] = splitOnce(m1, "]")
      const [, m3] = splitOnce(m2, "[")
      const [ruleCategory, m4] = splitOnce(m3, "]")
      const errorMsg =
        m4?.charAt(0) === ":" ? m4?.slice(1).trimStart() : m4?.trimStart()
      const [specPart1, m5] = splitOnce(ruleCategory, "-")
      const [specPart2, m6] = splitOnce(m5, "-")
      const [rulePart1, m7] = splitOnce(m6, "-")
      const [rulePart2] = splitOnce(m7, "-")
      const specification = specificationMap.get(specPart1 + "-" + specPart2)
      const rule = rulePart2 ? DIR_PREFIX + rulePart2 : RULE_PREFIX + rulePart1

      const severityInResult = severityMap.get(result.getSeverity())
      const severity = severityInResult ? severityInResult : "未定义"

      // if the errorMsg is not in the expected format, we add it to unknownResults
      if (!issueCode || !errorMsg || !specification || !rule) {
        unknownResults.push({
          errorMsg: result.getErrorMessage(),
          location,
          locationData,
        })
        continue
      }

      // record specification
      specifications.add(specification)
      // iterate thru ruleCategoryMap to get the current category
      let category = "mandatory"
      for (const [categoryKey, categoryValue] of ruleCategoryMap) {
        for (const categoryRule of categoryValue) {
          if (m2.slice(1) === categoryRule) {
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
      ${isWhiteTheme() ? `<link href="${lightStyleUri}" rel="stylesheet">` : ""}
      ${this._introProvider.renderRunDemoHTML()}
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
        <div class="head" id="results-head">
          <div data-column="issueCode" class="ceil pointer" id="issueCode-order">
            <div class="truncate">
              错误代码<img
                class="arrow"
                id="issueCode-arrow"
                src=${arrowDownUri}
              />
            </div>
          </div>
          <div data-column="severity" class="ceil pointer" id="severity-order">
            <div class="truncate">
              严重程度<img class="arrow" id="severity-arrow" src=${arrowDownUri} />
            </div>
          </div>
          <div data-column="specification" class="ceil w-96">
            <div class="truncate">规范</div>
          </div>
          <div data-column="rule" class="ceil pointer" id="rule-order">
            <div class="truncate">
              规则<img class="arrow" id="rule-arrow" src=${arrowDownUri} />
            </div>
          </div>
          <div data-column="category" class="ceil pointer" id="category-order">
            <div class="truncate">
              类别<img class="arrow" id="category-arrow" src=${arrowDownUri} />
            </div>
          </div>
          <div data-column="errorMsg" class="ceil grow">
            <div class="truncate">错误信息</div>
          </div>
          <div data-column="location" class="ceil w-128 pointer" id="location-order">
            <div class="truncate">
              文件位置<img class="arrow" id="location-arrow" src=${arrowDownUri} />
            </div>
          </div>
        </div>
      </div>
      <div id="virtual-list-container">
        <div id="results"></div>
      </div>
      <div id="unknown-results" class="display-none">
        <div class="head"><div class="ceil">未知错误信息</div></div>
      </div>
      <script>
        const vscode = acquireVsCodeApi()
        // virtual list set up
        const rowHeight = 27
        const stickyTopHeight = 72
        const virtualListContainer = document.querySelector('#virtual-list-container')
        virtualListContainer.setAttribute(
          'style',
          \`height: \${window.innerHeight - stickyTopHeight}px;\`
        )

        ${this._introProvider.renderRunDemoJS()}

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
        let filteredResults = results
        const container = document.getElementById('results')
        const filterOptions = {
          severity: '',
          specification: '',
          category: ''
        }
        let searchKeyWord = ''
        let resultsHTML = ''

        const addResultToHTML = result => {
          const keywordReg = new RegExp(searchKeyWord, 'sg')

          const highlightKeyword = data => {
            // skip if we are not searching for anything
            if (!searchKeyWord) {
              return data
            }
            return data.replace(
              keywordReg,
              match => \`<span class="keyword">\${match}</span>\`
            )
          }

          resultsHTML += \`
            <div class="row focused" tabindex="0" data-location=\${JSON.stringify(
              result.locationData
            )} >
              <div  data-column='issueCode' class="ceil truncate">\${highlightKeyword(
                result.issueCode
              )}</div>
              <div  data-column='severity' class="ceil truncate">\${highlightKeyword(
                result.severity
              )}</div>
              <div  data-column='specification' class="ceil truncate w-96">\${highlightKeyword(
                result.specification
              )}</div>
              <div  data-column='rule' class="ceil truncate">\${highlightKeyword(
                result.rule
              )}</div>
              <div  data-column='category' class="ceil truncate">\${highlightKeyword(
                result.category
              )}</div>
              <div  data-column='errorMsg' class="ceil truncate grow">\${highlightKeyword(
                result.errorMsg
              )}</div>
              <div  data-column='location' class="ceil truncate w-128">\${highlightKeyword(
                result.location
              )}</div>
            </div>
          \`
        }

        const columnsWidth = {
          issueCode: null,
          severity: null,
          specification: null,
          rule: null,
          category: null,
          errorMsg: null,
          location: null
        }

        // function to column width
        const updateWidth = () => {
          for (const column in columnsWidth) {
            const ceils = document.querySelectorAll(\`[data-column=\${column}]\`)
            for (const ceil of ceils) {
              ceil.style.width = columnsWidth[column] + 'px'
            }
          }
        }

        const addJumpToFileListener = () => {
          for (const row of document.getElementsByClassName('row')) {
            row.addEventListener('click', e => {
              vscode.postMessage(e.currentTarget.dataset.location)
            })
          }
        }

        const renderHTML = () => {
          resultsHTML = ''

          // get visible results by scroll offset and row height
          const startIndex = Math.floor(virtualListContainer.scrollTop / rowHeight)
          const endIndex = startIndex + Math.ceil(window.innerHeight / rowHeight)
          const visibleResults = filteredResults.slice(startIndex, endIndex + 1)

          // calculate and apply top and bottom paddings
          const paddingTop = startIndex * rowHeight
          const paddingBottom = (filteredResults.length - endIndex) * rowHeight
          container.setAttribute(
            'style',
            \`padding-top: \${paddingTop}px; padding-bottom: \${paddingBottom}px\`
          )

          // render visible results
          for (const result of visibleResults) {
            addResultToHTML(result)
          }
          container.innerHTML = resultsHTML
          updateWidth()
          addJumpToFileListener()
        }

        // initial render
        renderHTML()

        // re-render on scroll
        virtualListContainer.addEventListener('scroll', () => {
          renderHTML()
        })

        const getFilteredResult = () => {
          filteredResults = results
          // filter by select
          for (const key in filterOptions) {
            if (filterOptions[key]) {
              filteredResults = filteredResults.filter(
                result => result[key] === filterOptions[key]
              )
            }
          }

          // filter by search keyword
          if (searchKeyWord) {
            filteredResults = filteredResults.filter(result => {
              const keywordReg = new RegExp(searchKeyWord, 'sg')
              let matchFound = false
              for (const key in result) {
                if (key !== 'locationData' && result[key].match(keywordReg))
                  matchFound = true
              }
              return matchFound
            })
          }
        }

        ;['category', 'severity', 'specification'].map(id =>
          document.getElementById(id).addEventListener('change', e => {
            filterOptions[e.target.name] = e.target.value
            getFilteredResult()
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
          const n1 = rule1.split(' ')[1]
          const n2 = rule2.split(' ')[1]
          // compare by rule number
          const [n1Major, n1Minor, n1Rule] = n1.split('.')
          const [n2Major, n2Minor, n2Rule] = n2.split('.')
          if (n1Major !== n2Major) return parseInt(n1Major) - parseInt(n2Major) || 0
          if (n1Minor !== n2Minor) return parseInt(n1Minor) - parseInt(n2Minor) || 0
          return parseInt(n1Rule) - parseInt(n2Rule) || 0
        }

        ;['issueCode', 'category', 'severity', 'rule', 'location'].map(id =>
          document.getElementById(\`\${id}-order\`).addEventListener('click', e => {
            document.getElementById(\`\${id}-arrow\`).src = orderUp[id]
              ? "${arrowDownUri}"
              : "${arrowUpUri}"
            filteredResults = filteredResults.sort((r1, r2) => {
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
            searchKeyWord = e.target.value
            getFilteredResult()
            renderHTML(e.target.value)
          }, 250)
        )

        // resize handler to update the virtual list when the window is resized
        window.addEventListener(
          'resize',
          debounce(() => {
            virtualListContainer.setAttribute(
              'style',
              \`height: \${window.innerHeight - stickyTopHeight}px;\`
            )
            renderHTML()
           }, 250)
        )

        // initials columns width data when the page is loaded
        for (const key in columnsWidth) {
          columnsWidth[key] = parseInt(
            window.getComputedStyle(document.querySelector(\`[data-column='\${key}']\`))
              .width
          )
        }

        // retrieve all headings in results table
        const heads = document.querySelectorAll('#results-head .ceil')

        for (let i = 0; i < heads.length - 1; i++) {
          // create a dragger between each columns
          const drag = document.createElement('div')
          drag.classList.add('drag')
          drag.style.height = window.innerHeight - stickyTopHeight + rowHeight + 'px'

          const [left, right] = [heads[i], heads[i + 1]]
          const leftCol = left.dataset.column
          const rightCol = right.dataset.column
          left.appendChild(drag)

          // x position at mouse down
          let clientX = 0
          // x offset at mouse move
          let dx = 0
          // safe x offset so all columns width will be positive
          let safeDx = 0

          drag.addEventListener('click', e => {
            // stop propagation to prevent triggering sort click event
            e.stopPropagation()
          })

          drag.addEventListener('mousedown', e => {
            // record the current mouse position
            clientX = e.clientX

            // add drag handler and mouse up handler
            document.addEventListener('mousemove', mouseMoveHandler)
            document.addEventListener('mouseup', mouseUpHandler)
          })

          const mouseMoveHandler = e => {
            // calculate how far the mouse has been moved
            dx = e.clientX - clientX

            // Update the width of the left and right columns
            if (columnsWidth[leftCol] + dx > 0 && columnsWidth[rightCol] - dx > 0) {
              safeDx = dx

              const leftColumns = document.querySelectorAll(
                \`[data-column='\${leftCol}']\`
              )
              const rightColumns = document.querySelectorAll(
                \`[data-column='\${rightCol}']\`
              )

              for (const col of leftColumns) {
                col.style.width = columnsWidth[leftCol] + safeDx + 'px'
              }
              for (const col of rightColumns) {
                col.style.width = columnsWidth[rightCol] - safeDx + 'px'
              }
            }
          }

          const mouseUpHandler = () => {
            // update columns width when the mouse is released
            columnsWidth[leftCol] += safeDx
            columnsWidth[rightCol] -= safeDx

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
