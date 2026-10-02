import { createRequire } from "module"
import fs from "fs"
import path from "path"

const require = createRequire(import.meta.url)
const ee = require("@google/earthengine")

let initialized = false
let initPromise: Promise<void> | null = null

function loadPrivateKey() {

  const envJson = process.env.GEE_SERVICE_ACCOUNT_JSON
  if (envJson) {
    try {
      return JSON.parse(envJson)
    } catch (e) {
      throw new Error("Failed to parse GEE_SERVICE_ACCOUNT_JSON. Ensure it is valid JSON.")
    }
  }


  const keyPath = process.env.GEE_SERVICE_ACCOUNT_KEY_PATH
  if (!keyPath) {
    throw new Error("GEE_SERVICE_ACCOUNT_KEY_PATH is not set in env")
  }
  const resolvedPath = path.resolve(/* turbopackIgnore: true */ process.cwd(), keyPath)
  const raw = fs.readFileSync(resolvedPath, "utf-8")
  return JSON.parse(raw)
}

export function getEE(): Promise<typeof ee> {
  if (initialized) {
    return Promise.resolve(ee)
  }
  if (initPromise) {
    return initPromise.then(() => ee)
  }

  initPromise = new Promise((resolve, reject) => {
    const privateKey = loadPrivateKey()

    ee.data.authenticateViaPrivateKey(
      privateKey,
      () => {
        ee.initialize(
          null,
          null,
          () => {
            initialized = true
            resolve()
          },
          (err: unknown) => {
            reject(new Error("EE initialization error: " + err))
          },
          null,
          privateKey.project_id
        )
      },
      (err: unknown) => {
        reject(new Error("EE authentication error: " + err))
      }
    )
  })

  return initPromise.then(() => ee)
}

// Wrap EE's callback-style .evaluate() into a Promise
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function evaluate<T = any>(eeObject: any): Promise<T> {
  return new Promise((resolve, reject) => {
    eeObject.evaluate(
      (value: T) => resolve(value),
      (err: string) => reject(new Error(String(err)))
    )
  })
}