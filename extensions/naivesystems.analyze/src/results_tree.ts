import * as vscode from "vscode"

export interface Location {
  filePath: string
  lineNumber: number
}

export const ruleLocationsMap: Map<string, Array<Location>> = new Map()

export const ruleCategoryMap: Map<string, Array<string>> = new Map([
  [
    "mandatory",
    [
      "misra-c2012-9.1",
      "misra-c2012-12.5",
      "misra-c2012-13.6",
      "misra-c2012-17.3",
      "misra-c2012-17.4",
      "misra-c2012-17.6",
      "misra-c2012-19.1",
      "misra-c2012-21.13",
      "misra-c2012-21.17",
      "misra-c2012-21.18",
      "misra-c2012-21.19",
      "misra-c2012-21.20",
      "misra-c2012-22.2",
      "misra-c2012-22.4",
      "misra-c2012-22.5",
      "misra-c2012-22.6",
    ],
  ],
  [
    "required",
    [
      "misra-c2012-dir-4.3",
      "misra-c2012-dir-4.7",
      "misra-c2012-dir-4.10",
      "misra-c2012-dir-4.12",
      "misra-c2012-dir-4.14",
      "misra-c2012-1.1",
      "misra-c2012-1.4",
      "misra-c2012-2.1",
      "misra-c2012-2.2",
      "misra-c2012-3.1",
      "misra-c2012-3.2",
      "misra-c2012-4.1",
      "misra-c2012-5.1",
      "misra-c2012-5.2",
      "misra-c2012-5.3",
      "misra-c2012-5.4",
      "misra-c2012-5.5",
      "misra-c2012-5.6",
      "misra-c2012-5.7",
      "misra-c2012-5.8",
      "misra-c2012-6.1",
      "misra-c2012-6.2",
      "misra-c2012-7.1",
      "misra-c2012-7.2",
      "misra-c2012-7.3",
      "misra-c2012-7.4",
      "misra-c2012-8.1",
      "misra-c2012-8.2",
      "misra-c2012-8.3",
      "misra-c2012-8.4",
      "misra-c2012-8.5",
      "misra-c2012-8.6",
      "misra-c2012-8.8",
      "misra-c2012-8.10",
      "misra-c2012-8.12",
      "misra-c2012-8.14",
      "misra-c2012-9.2",
      "misra-c2012-9.3",
      "misra-c2012-9.4",
      "misra-c2012-9.5",
      "misra-c2012-10.1",
      "misra-c2012-10.2",
      "misra-c2012-10.3",
      "misra-c2012-10.4",
      "misra-c2012-10.6",
      "misra-c2012-10.7",
      "misra-c2012-10.8",
      "misra-c2012-11.1",
      "misra-c2012-11.2",
      "misra-c2012-11.3",
      "misra-c2012-11.6",
      "misra-c2012-11.7",
      "misra-c2012-11.8",
      "misra-c2012-11.9",
      "misra-c2012-12.2",
      "misra-c2012-13.1",
      "misra-c2012-13.2",
      "misra-c2012-13.5",
      "misra-c2012-14.1",
      "misra-c2012-14.2",
      "misra-c2012-14.3",
      "misra-c2012-14.4",
      "misra-c2012-15.2",
      "misra-c2012-15.3",
      "misra-c2012-15.6",
      "misra-c2012-15.7",
      "misra-c2012-16.1",
      "misra-c2012-16.2",
      "misra-c2012-16.3",
      "misra-c2012-16.4",
      "misra-c2012-16.5",
      "misra-c2012-16.6",
      "misra-c2012-16.7",
      "misra-c2012-17.1",
      "misra-c2012-17.2",
      "misra-c2012-17.7",
      "misra-c2012-18.1",
      "misra-c2012-18.2",
      "misra-c2012-18.3",
      "misra-c2012-18.6",
      "misra-c2012-18.7",
      "misra-c2012-18.8",
      "misra-c2012-20.2",
      "misra-c2012-20.3",
      "misra-c2012-20.4",
      "misra-c2012-20.6",
      "misra-c2012-20.7",
      "misra-c2012-20.8",
      "misra-c2012-20.9",
      "misra-c2012-20.11",
      "misra-c2012-20.12",
      "misra-c2012-20.13",
      "misra-c2012-20.14",
      "misra-c2012-21.1",
      "misra-c2012-21.2",
      "misra-c2012-21.3",
      "misra-c2012-21.4",
      "misra-c2012-21.5",
      "misra-c2012-21.6",
      "misra-c2012-21.7",
      "misra-c2012-21.8",
      "misra-c2012-21.9",
      "misra-c2012-21.10",
      "misra-c2012-21.11",
      "misra-c2012-21.14",
      "misra-c2012-21.15",
      "misra-c2012-21.16",
      "misra-c2012-21.21",
      "misra-c2012-22.1",
      "misra-c2012-22.3",
      "misra-c2012-22.7",
      "misra-c2012-22.8",
      "misra-c2012-22.9",
      "misra-c2012-22.10",
    ],
  ],
  [
    "advisory",
    [
      "misra-c2012-2.3",
      "misra-c2012-2.4",
      "misra-c2012-2.5",
      "misra-c2012-2.6",
      "misra-c2012-2.7",
      "misra-c2012-4.2",
      "misra-c2012-5.9",
      "misra-c2012-8.7",
      "misra-c2012-8.9",
      "misra-c2012-8.11",
      "misra-c2012-10.5",
      "misra-c2012-11.4",
      "misra-c2012-11.5",
      "misra-c2012-12.1",
      "misra-c2012-12.3",
      "misra-c2012-12.4",
      "misra-c2012-13.3",
      "misra-c2012-13.4",
      "misra-c2012-15.1",
      "misra-c2012-15.4",
      "misra-c2012-15.5",
      "misra-c2012-17.5",
      "misra-c2012-17.8",
      "misra-c2012-18.4",
      "misra-c2012-18.5",
      "misra-c2012-19.2",
      "misra-c2012-20.1",
      "misra-c2012-20.5",
      "misra-c2012-20.10",
      "misra-c2012-21.12",
    ],
  ],
  ["secrets", ["potential-secrets-leak"]],
  ["unknown", []],
])

class ResultItem extends vscode.TreeItem {
  level: number
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    level: number = 0,
    command?: vscode.Command
  ) {
    super(label, collapsibleState)
    this.tooltip = `${this.label}`
    this.level = level
    this.command = command
  }
}

export class ResultsTreeProvider
  implements vscode.TreeDataProvider<ResultItem>
{
  categoryNodes: ResultItem[]
  firstLevelNodes: Map<string, ResultItem[]>
  secondLevelNodes: Map<string, ResultItem[]>
  constructor() {
    const categorys = Array.from(ruleCategoryMap.keys())
    this.firstLevelNodes = new Map()
    categorys.forEach((category) => {
      this.firstLevelNodes.set(
        category,
        Array.from(ruleLocationsMap.keys())
          .sort()
          .filter((item: string) => {
            if (category === "unknown") {
              return ![...ruleCategoryMap.values()]
                .flat()
                ?.some((ruleName: string) => item.indexOf(ruleName) >= 0)
            }
            return ruleCategoryMap
              .get(category)
              ?.some((ruleName: string) => item.indexOf(ruleName) >= 0)
          })
          .map(
            (item: string) =>
              new ResultItem(
                `${item} (${ruleLocationsMap.get(item)?.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                1
              )
          )
      )
    })
    this.categoryNodes = categorys.map(
      (category: string) =>
        new ResultItem(
          `${category} (${this.firstLevelNodes.get(category)?.length})`,
          vscode.TreeItemCollapsibleState.Collapsed
        )
    )
    let workspaceRoot: string = ""
    if (
      vscode.workspace.workspaceFolders !== undefined &&
      vscode.workspace.workspaceFolders.length > 0
    ) {
      workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath
    }
    this.secondLevelNodes = new Map()
    ruleLocationsMap.forEach((locations, rule) => {
      this.secondLevelNodes.set(
        rule,
        locations
          .map(
            (item) =>
              new ResultItem(
                item.filePath
                  .replace(
                    new RegExp(
                      "^" +
                        `${workspaceRoot}`.replace(
                          /[.*+?^${}()|[\]\\]/g,
                          "\\$&"
                        )
                    ),
                    ""
                  )
                  .substring(1) +
                  ":" +
                  item.lineNumber,
                vscode.TreeItemCollapsibleState.None,
                2,
                {
                  title: "",
                  command: "nsa-result-highlight.jump_to",
                  arguments: [item],
                }
              )
          )
          .sort()
      )
    })
  }
  getTreeItem(
    element: ResultItem
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element
  }
  getChildren(element: ResultItem): vscode.ProviderResult<ResultItem[]> {
    if (element) {
      if (element.level === 0) {
        // Get first-level nodes, a.k.a. all rules.
        const category = element.label.split(" ")[0]
        return Promise.resolve(this.firstLevelNodes.get(category))
      } else if (element.level === 1) {
        // Get second-level nodes, a.k.a. all locations for this rule.
        const rule = element.label.split(" ")[0]
        const nodes = this.secondLevelNodes.get(rule) ?? []
        return Promise.resolve(nodes)
      }
    } else {
      return Promise.resolve(this.categoryNodes)
    }
  }
}
