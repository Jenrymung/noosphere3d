/** Node visits. A new visit drops anything that had been undone with Back. */
export class NavHistory {
  private stack: string[] = [];
  private index = -1;

  get current(): string | null {
    return this.index >= 0 ? this.stack[this.index] : null;
  }

  visit(id: string): void {
    if (this.current === id) return;
    this.stack.splice(this.index + 1);
    this.stack.push(id);
    this.index = this.stack.length - 1;
  }

  back(): string | null {
    if (this.index <= 0) return null;
    this.index -= 1;
    return this.stack[this.index];
  }

  forward(): string | null {
    if (this.index < 0 || this.index >= this.stack.length - 1) return null;
    this.index += 1;
    return this.stack[this.index];
  }
}
