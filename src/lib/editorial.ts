export const focalPositions = {
  center: "50% 50%",
  top: "50% 0%",
  bottom: "50% 100%",
  left: "0% 50%",
  right: "100% 50%",
  "top-left": "0% 0%",
  "top-right": "100% 0%",
  "bottom-left": "0% 100%",
  "bottom-right": "100% 100%",
} as const;

export type FocalPoint = keyof typeof focalPositions;
export type CropMode = "contain" | "cover";
export type PhotoPlacement = "auto" | "left" | "right";
export type EssayPalette = "paper" | "dusk" | "field" | "night" | "custom";
export type EssayTypography = "editorial" | "direct" | "soft";
export type EssayHeader = "quiet" | "poster" | "index";
export type EssayHeaderAlignment = "start" | "center" | "end";
export type EssayHeaderScale = "compact" | "standard" | "display";
export type EssayHeaderFont = "inherit" | "serif" | "sans";

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
}

export interface EssayTheme {
  palette: EssayPalette;
  typography: EssayTypography;
  header: EssayHeader;
  headerAlignment: EssayHeaderAlignment;
  headerScale: EssayHeaderScale;
  headerFont: EssayHeaderFont;
  custom?: {
    light: ThemeColors;
    dark: ThemeColors;
  };
}

export const defaultEssayTheme: EssayTheme = {
  palette: "paper",
  typography: "editorial",
  header: "quiet",
  headerAlignment: "start",
  headerScale: "standard",
  headerFont: "inherit",
};

export function getEssayTheme(theme?: Partial<EssayTheme>): EssayTheme {
  return {
    ...defaultEssayTheme,
    ...theme,
  };
}

export function getPhotoPresentation(photo: {
  focalPoint?: FocalPoint;
  crop?: CropMode;
  placement?: PhotoPlacement;
}) {
  return {
    focalPoint: photo.focalPoint ?? "center",
    crop: photo.crop ?? "contain",
    placement: photo.placement ?? "auto",
  };
}

export function customThemeStyle(theme: EssayTheme) {
  if (theme.palette !== "custom" || !theme.custom) return undefined;
  return (["light", "dark"] as const)
    .flatMap((mode) => {
      const { background, surface, text, muted, accent } = theme.custom![mode];
      return [
        `--custom-${mode}-background:${background}`,
        `--custom-${mode}-surface:${surface}`,
        `--custom-${mode}-text:${text}`,
        `--custom-${mode}-muted:${muted}`,
        `--custom-${mode}-accent:${accent}`,
      ];
    })
    .join(";");
}

export function chromeThemeStyle(theme?: EssayTheme) {
  return theme ? customThemeStyle(theme) : undefined;
}

export function tagLabel(tag: string) {
  return `#${tag}`;
}
