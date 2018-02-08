/* eslint no-console: 0 */

const info = (...args : any[]) => {
  if (!process.env.MIGSI_QUIET) {
    console.log(...args)
  }
}

const warn = (...args : any[]) => {
  if (!process.env.MIGSI_QUIET) {
    console.warn(...args)
  }
}

const error = (...args : any[]) => {
  if (!process.env.MIGSI_QUIET) {
    console.error(...args)
  }
}

const write = (data : any) => {
  if (!process.env.MIGSI_QUIET) {
    process.stdout.write(data)
  }
}

const api = {
  info,
  warn,
  error,
  write
}

export default api