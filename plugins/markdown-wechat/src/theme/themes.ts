import type { FontId, ThemeId } from "../contracts.ts";

export interface WechatTheme {
  id: ThemeId;
  label: string;
  accent: string;
  accentSoft: string;
  ink: string;
  muted: string;
  border: string;
  codeBackground: string;
  quoteBackground: string;
}

export const WECHAT_THEMES: readonly WechatTheme[] = [
  {
    id: "editorial",
    label: "Editorial",
    accent: "#176b87",
    accentSoft: "#e9f4f6",
    ink: "#202326",
    muted: "#687078",
    border: "#d9dee2",
    codeBackground: "#f4f6f7",
    quoteBackground: "#f1f7f8",
  },
  {
    id: "jade",
    label: "Jade",
    accent: "#2d6a4f",
    accentSoft: "#edf6f0",
    ink: "#1f2a24",
    muted: "#66736b",
    border: "#d5e2d9",
    codeBackground: "#f2f6f3",
    quoteBackground: "#edf6f0",
  },
  {
    id: "signal",
    label: "Signal",
    accent: "#b5472d",
    accentSoft: "#fff1ed",
    ink: "#262221",
    muted: "#746b68",
    border: "#e5d8d4",
    codeBackground: "#f8f4f2",
    quoteBackground: "#fff1ed",
  },
] as const;

export const FONT_STACKS: Record<FontId, string> = {
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC','Microsoft YaHei',sans-serif",
  serif: "'Noto Serif SC','Songti SC','STSong',Georgia,serif",
  mono: "'JetBrains Mono','SFMono-Regular',Consolas,monospace",
};

export function resolveTheme(id: unknown): WechatTheme {
  return WECHAT_THEMES.find((theme) => theme.id === id) ?? WECHAT_THEMES[0]!;
}

export function resolveFont(id: unknown): FontId {
  return id === "serif" || id === "mono" ? id : "sans";
}

export function resolveFontSize(value: unknown): number {
  const size = Number(value);
  return Number.isFinite(size) ? Math.max(13, Math.min(22, Math.round(size))) : 16;
}
