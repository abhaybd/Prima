export interface RpcRequest {
  id: number
  method: string
  args?: unknown
}

export interface RpcResponse {
  id: number
  result?: unknown
  error?: string
}

export class SeqRpc {
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()

  next(): number {
    return this.nextId++
  }

  wait<T>(id: number): Promise<T> {
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      })
    })
  }

  settle(msg: RpcResponse): void {
    const pending = this.pending.get(msg.id)
    if (!pending) return
    this.pending.delete(msg.id)
    if (msg.error) pending.reject(new Error(msg.error))
    else pending.resolve(msg.result)
  }

  /** Drop a stale in-flight request so its response is ignored. */
  cancel(id: number): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    pending.reject(new Error('cancelled'))
  }

  isCurrent(id: number): boolean {
    return this.pending.has(id)
  }
}
