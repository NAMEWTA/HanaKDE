declare module "esbuild" {
  export interface BuildOptions { [key: string]: unknown }
  export function build(options: BuildOptions): Promise<unknown>;
}

declare module "jsdom" {
  export interface ConstructorOptions {
    pretendToBeVisual?: boolean;
    url?: string;
  }

  export class JSDOM {
    constructor(html?: string, options?: ConstructorOptions);
    readonly window: Window & typeof globalThis;
  }
}

declare module "react" {
  export interface MutableRefObject<T> { current: T }
  export function useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
  export function useRef<T>(initialValue: T): MutableRefObject<T>;
  const React: {
    createElement: (...args: unknown[]) => unknown;
  };
  export default React;
}

declare module "react/jsx-runtime" {
  export const Fragment: unknown;
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown;
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown;
}

declare module "react-dom/client" {
  export interface Root { render(node: unknown): void; unmount(): void }
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare module "@hana/plugin-components" {
  export const HanaThemeProvider: (props: { mode?: "inherit" | "light" | "dark"; children?: unknown }) => unknown;
}

declare namespace React {
  type ReactElement = unknown;
}

declare namespace JSX {
  interface IntrinsicElements { [name: string]: Record<string, unknown> }
}
