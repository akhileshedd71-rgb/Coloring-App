import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { drawings } from "../src/data/drawings";
import type { Drawing } from "../src/types";

const categories = ["Flowers", "Patterns", "Paisley", "Doodles", "Cartoons"];
const expansion = drawings.filter((drawing) =>
  drawing.id.startsWith("lineart-"),
);

test("the expansion contains 25 uncolored line-art pages, five in each requested category", () => {
  expect(expansion).toHaveLength(25);
  for (const category of categories)
    expect(
      expansion.filter((drawing) => drawing.category === category),
    ).toHaveLength(5);
  for (const drawing of expansion) {
    const thumbnail = readFileSync(`public${drawing.thumbnail}`, "utf8");
    // The preview contains only the white page and one compound ink silhouette.
    // Suggested number colors remain metadata until the artist starts painting.
    expect(thumbnail.match(/<path\b/g), drawing.id).toHaveLength(1);
    expect(thumbnail).toContain('fill="#fff"');
    expect(thumbnail).toContain('fill-rule="evenodd"');
    expect(thumbnail).not.toMatch(
      /<(?:image|text|linearGradient|radialGradient)\b/,
    );
  }
});

for (const category of categories) {
  test(`${category} line art opens and colors accurately on a phone`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const item = expansion.find((drawing) => drawing.category === category)!;
    const detail = JSON.parse(
      readFileSync(`public${item.asset}`, "utf8"),
    ) as Drawing;
    const region = [...detail.regions].sort(
      (a, b) => (b.labelRadius ?? 0) - (a.labelRadius ?? 0),
    )[0];
    await page.goto("/");
    await page
      .locator(".category-row")
      .getByRole("button", { name: category })
      .click();
    await expect(page.locator(".drawing-card")).toHaveCount(5);
    await page
      .getByRole("button", {
        name: `${item.title}, ${item.difficulty}`,
        exact: true,
      })
      .click();
    const canvas = page.getByRole("img", {
      name: "Coloring canvas",
      exact: true,
    });
    await expect(canvas).toBeVisible();
    const pixel = () =>
      canvas.evaluate((node, point) => {
        const surface = node as HTMLCanvasElement;
        const density = surface.width / 800;
        return [
          ...surface
            .getContext("2d")!
            .getImageData(
              Math.round(point[0] * density),
              Math.round(point[1] * density),
              1,
              1,
            ).data,
        ];
      }, region.label!);
    await expect.poll(pixel).toEqual([255, 255, 255, 255]);
    await page.getByRole("button", { name: "Turquoise", exact: true }).click();
    const bounds = (await canvas.boundingBox())!;
    await canvas.dispatchEvent("pointerdown", {
      clientX: bounds.x + (region.label![0] * bounds.width) / 800,
      clientY: bounds.y + (region.label![1] * bounds.height) / 800,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
    });
    await expect.poll(pixel).toEqual([93, 201, 197, 255]);
    await page
      .getByRole("button", { name: "Undo last action", exact: true })
      .click();
    await expect.poll(pixel).toEqual([255, 255, 255, 255]);
    await page
      .getByRole("button", { name: "Redo last action", exact: true })
      .click();
    await expect.poll(pixel).toEqual([93, 201, 197, 255]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
}
