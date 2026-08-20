import { createRequire } from "module"
import fs from "fs"
import path from "path"

const require = createRequire(import.meta.url)
const ee = require("@google/earthengine")

let initialized = false
let initPromise: Promise<void> | null = null

function loadPrivateKey() {
  const keyPath = process.env.GEE_SERVICE_ACCOUNT_KEY_PATH
  if (!keyPath) {
    throw new Error("GEE_SERVICE_ACCOUNT_KEY_PATH is not set in env")
  }
  const resolvedPath = path.resolve(process.cwd(), keyPath)
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