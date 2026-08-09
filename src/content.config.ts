import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const essaysBase = process.env.MPOV_CONTENT_ROOT?.trim() || "./src/content/ensaios";

const photoSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  src: z.string().min(1),
  alt: z.string().min(1),
  caption: z.string().optional(),
  focalPoint: z
    .enum([
      "center",
      "top",
      "bottom",
      "left",
      "right",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ])
    .optional(),
  crop: z.enum(["contain", "cover"]).optional(),
  placement: z.enum(["auto", "left", "right"]).optional(),
  display: z.enum(["full", "wide", "portrait"]).default("full"),
});

const galleryLayoutSchema = z.enum(["sequence", "pages", "margins"]).default("sequence");
const tagSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const themeColorsSchema = z.object({
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  surface: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  muted: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const themeSchema = z
  .object({
    palette: z.enum(["paper", "dusk", "field", "night", "custom"]).optional(),
    typography: z.enum(["editorial", "direct", "soft"]).optional(),
    header: z.enum(["quiet", "poster", "index"]).optional(),
    headerAlignment: z.enum(["start", "center", "end"]).optional(),
    headerScale: z.enum(["compact", "standard", "display"]).optional(),
    headerFont: z.enum(["inherit", "serif", "sans"]).optional(),
    custom: z
      .object({
        light: themeColorsSchema,
        dark: themeColorsSchema,
      })
      .optional(),
  })
  .superRefine((theme, context) => {
    if (theme.palette === "custom" && !theme.custom) {
      context.addIssue({
        code: "custom",
        message: "Uma paleta personalizada precisa de cores para os modos claro e escuro.",
        path: ["custom"],
      });
    }
  });

const essays = defineCollection({
  loader: glob({ base: essaysBase, pattern: "**/*.md" }),
  schema: ({ image }) =>
    z.object({
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .optional(),
      title: z.string().min(1),
      date: z.coerce.date(),
      location: z.string().max(120).optional(),
      excerpt: z.string().max(180).optional(),
      draft: z.boolean().default(true),
      layout: galleryLayoutSchema,
      tags: z.array(tagSchema).max(12).optional(),
      theme: themeSchema.optional(),
      coverId: z.string().min(1),
      photos: z.array(
        photoSchema.extend({
          src: image(),
        }),
      ),
    }),
});

export const collections = { essays };
