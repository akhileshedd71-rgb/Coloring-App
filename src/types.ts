export type Mode = "fill" | "paint" | "draw" | "glow" | "number";
export type Tool =
  | "fill"
  | "brush"
  | "crayon"
  | "glitter"
  | "eraser"
  | "sticker";
export interface Region {
  id: string;
  d: string;
  color: string;
  number: number;
  label?: [number, number];
}
export interface Drawing {
  id: string;
  title: string;
  category: string;
  difficulty: "easy" | "medium";
  background: string;
  regions: Region[];
  lines?: string[];
  accent: string;
}
export interface Stroke {
  tool: "brush" | "crayon" | "glitter" | "eraser";
  color: string;
  size: number;
  points: [number, number][];
}
export interface Sticker {
  x: number;
  y: number;
  emoji: string;
  size: number;
}
export interface Artwork {
  id: string;
  drawingId: string;
  profileId: string;
  title: string;
  mode: Mode;
  fills: Record<string, string>;
  strokes: Stroke[];
  stickers: Sticker[];
  updatedAt: number;
  thumbnail?: string;
}
export interface Profile {
  id: string;
  name: string;
  avatar: string;
}
export interface Settings {
  sound: boolean;
  hints: boolean;
  difficulty: "all" | "easy";
}
export const PALETTE = [
  "#FF6B79",
  "#FF9F43",
  "#FFD35C",
  "#85CC8C",
  "#5DC9C5",
  "#73B9EF",
  "#9A8BE8",
  "#DB91CD",
  "#A77B60",
  "#303F53",
  "#FFFFFF",
];
