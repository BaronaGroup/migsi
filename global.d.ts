declare module "dependency-solver" {
  export function solve(tree: any): string[]
}

declare module "node-getopt-long" {
  export type Option = string[]

  export function options(options: Option[], getoptOptions: object): object
}
