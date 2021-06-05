import * as cliColor from 'cli-color'

export function xtermColor(color: number) {
  if (process.stdout.isTTY) {
    return cliColor.xterm(color)
  } else {
    return cliColor
  }
}
