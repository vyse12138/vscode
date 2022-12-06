import { matchAllLocations } from "../util"
import { strict } from "assert"

describe("testing function matchAllLocations", () => {
  it("should match location with line number", () => {
    const errMsg = `the error is XXX
    it's at /src/FreeRTOS/Source/include/task.h:2701:1\nit's an error`
    strict.equal(matchAllLocations(errMsg).length, 1)
    strict.equal(
      matchAllLocations(errMsg)[0][0],
      "/src/FreeRTOS/Source/include/task.h:2701:1"
    )
  })

  it("should match location without line number", () => {
    const errMsg = `the error is XXX\nit's at /src/FreeRTOS/Source/include/task.h\nit's an error`
    strict.equal(matchAllLocations(errMsg).length, 1)
    strict.equal(
      matchAllLocations(errMsg)[0][0],
      "/src/FreeRTOS/Source/include/task.h"
    )
  })

  it("should not match '/'", () => {
    const errMsg = `the error is at '/' and it's not a location`
    strict.equal(matchAllLocations(errMsg).length, 0)
  })
})
