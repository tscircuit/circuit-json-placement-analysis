declare module "rbush" {
  export interface RBushBox {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }

  export default class RBush<T extends RBushBox> {
    constructor(maxEntries?: number)
    all(): T[]
    clear(): this
    insert(item: T): this
    load(items: readonly T[]): this
    remove(item: T, equalsFn?: (a: T, b: T) => boolean): this
    search(box: RBushBox): T[]
    collides(box: RBushBox): boolean
  }
}
