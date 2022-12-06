import { exec, ExecException, ExecOptions } from "child_process"
import * as os from "os"

export enum OS {
  Windows10,
  Windows7,
  MacOS,
  Linux,
}

// it should matches locations within the given string
// e.g matches `/src/FreeRTOS/Source/include/task.h:2701:1`
// or matches `/src/FreeRTOS/Source/include/task.h`
export const matchAllLocations = (str: string): RegExpMatchArray[] => {
  return [...str.matchAll(/((\/[^/ '\s]+)+\/?:\d+:\d+|(\/[^/ '\s]+)+\/?)/g)]
}

export const isWindows = () => {
  return process.platform === "win32"
}

export const isMac = () => {
  return process.platform === "darwin"
}

export const isLinux = () => {
  return process.platform === "linux"
}

export const isArm = () => {
  return process.arch === "arm64"
}

// return true if it's windows 10 or above
export const isWindows10 = () => {
  if (!isWindows()) return false
  const version = os.release().split(".")
  if (Number(version[0]) >= 10) {
    return true
  }
  return false
}

// return true if it's windows 7 or windows 8
export const isWindows7 = () => {
  if (!isWindows()) return false
  const version = os.release().split(".")
  // windows 7 is 6.1, windows 8 is 6.2
  if (Number(version[0]) === 6) {
    return true
  }
  return false
}

// node.js child_process.exec promise wrapper
export const asyncExec = async (
  cmd: string,
  options: ExecOptions = {}
): Promise<string | void> => {
  return new Promise((resolve, reject) => {
    exec(cmd, options, (error, stdout, stderr) => {
      if (error) {
        reject(error)
      }
      resolve(stdout ? stdout : stderr)
    })
  })
}

// type guard to check if the error is ExecException
// ExecException is the error thrown by child_process.exec, which contains a code property
// if the error is not an object or it doesn't contain code property, it's not an ExecException
export const isExecException = (err: any): err is ExecException => {
  return typeof err === "object" && "code" in err
}
