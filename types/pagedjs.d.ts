declare module 'pagedjs' {
  export class Previewer {
    constructor();
    preview(
      content: string | HTMLElement,
      stylesheets: string[],
      renderTo: HTMLElement,
    ): Promise<unknown>;
  }
}
