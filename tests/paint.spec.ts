import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Artwork } from "../src/types";

const pink = [255, 107, 121, 255];
const orange = [255, 159, 67, 255];
const turquoise = [93, 201, 197, 255];
const white = [255, 255, 255, 255];

function canvas(page: Page) {
  return page.getByRole("img", { name: "Coloring canvas", exact: true });
}

async function tap(page: Page, x: number, y: number, touch = false) {
  const surface = canvas(page);
  await surface.scrollIntoViewIfNeeded();
  const bounds = (await surface.boundingBox())!;
  const screenX = bounds.x + (x * bounds.width) / 800;
  const screenY = bounds.y + (y * bounds.height) / 800;
  if (touch) await page.touchscreen.tap(screenX, screenY);
  else await page.mouse.click(screenX, screenY);
}

async function stroke(
  page: Page,
  start: [number, number],
  end: [number, number],
) {
  await canvas(page).scrollIntoViewIfNeeded();
  const bounds = (await canvas(page).boundingBox())!;
  await page.mouse.move(
    bounds.x + (start[0] * bounds.width) / 800,
    bounds.y + (start[1] * bounds.height) / 800,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + (end[0] * bounds.width) / 800,
    bounds.y + (end[1] * bounds.height) / 800,
    { steps: 12 },
  );
  await page.mouse.up();
}

async function pixel(page: Page, x: number, y: number) {
  return canvas(page).evaluate(
    (node, position) => {
      const surface = node as HTMLCanvasElement;
      return [
        ...surface
          .getContext("2d")!
          .getImageData(
            Math.round((position[0] * surface.width) / 800),
            Math.round((position[1] * surface.height) / 800),
            1,
            1,
          ).data,
      ];
    },
    [x, y],
  );
}

async function savedArt(page: Page): Promise<Artwork | undefined> {
  return page.evaluate(async () => {
    const entries = await new Promise<Artwork[]>((resolve, reject) => {
      const request = indexedDB.open("little-color-club-art", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const get = database
          .transaction("artworks")
          .objectStore("artworks")
          .getAll();
        get.onsuccess = () => {
          database.close();
          resolve(get.result);
        };
        get.onerror = () => {
          database.close();
          reject(get.error);
        };
      };
    });
    return entries.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  });
}

async function bunny(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Let's make some magic" }).click();
  await expect(
    page.getByRole("heading", { name: "Happy bunny", exact: true }),
  ).toBeVisible();
  await expect(canvas(page)).toBeVisible();
}

test("tap fills the chosen region and saves a picture that can be reopened", async ({
  page,
}) => {
  await bunny(page);
  await page.getByRole("button", { name: "Turquoise", exact: true }).click();
  await tap(page, 167, 352); // Isolated star on the left of the bunny.
  await expect.poll(() => pixel(page, 167, 352)).toEqual(turquoise);
  await expect.poll(() => pixel(page, 395, 560)).toEqual(white);
  await page.getByRole("button", { name: "All done!", exact: true }).click();
  await expect
    .poll(async () => (await savedArt(page))?.fills["bunny-14"])
    .toBe("#5DC9C5");
  const thumbnail = (await savedArt(page))?.thumbnail;
  expect(thumbnail).toMatch(/^data:image\/png;base64,/);
  const thumbnailSize = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = source!;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, thumbnail);
  expect(thumbnailSize).toEqual([320, 320]);

  await page.reload();
  await page.getByRole("button", { name: /^My art/ }).click();
  await page
    .getByRole("button", { name: "Continue Happy bunny", exact: true })
    .click();
  await expect.poll(() => pixel(page, 167, 352)).toEqual(turquoise);
});

test("later shapes hide earlier outlines, while visible illustration lines survive painting", async ({
  page,
}) => {
  await bunny(page);
  // The head must cover the top of the body ellipse rather than showing through it.
  await expect.poll(() => pixel(page, 397, 346)).toEqual(white);
  await expect.poll(() => pixel(page, 397, 257)).toEqual([57, 76, 80, 255]);
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await page.getByRole("button", { name: "Pink", exact: true }).click();
  await tap(page, 397, 257);
  await expect.poll(() => pixel(page, 397, 257)).toEqual([57, 76, 80, 255]);
  await expect.poll(() => pixel(page, 397, 251)).toEqual(pink);
});

test("a brush tap makes a dot; erasing reveals its fill and undo restores the stroke", async ({
  page,
}) => {
  await bunny(page);
  await page.getByRole("button", { name: "Turquoise", exact: true }).click();
  await tap(page, 395, 560);
  await expect.poll(() => pixel(page, 395, 560)).toEqual(turquoise);
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await page.getByRole("button", { name: "Orange", exact: true }).click();
  await tap(page, 395, 560);
  await expect.poll(() => pixel(page, 395, 560)).toEqual(orange);
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await tap(page, 395, 560);
  await expect.poll(() => pixel(page, 395, 560)).toEqual(turquoise);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => pixel(page, 395, 560)).toEqual(orange);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => pixel(page, 395, 560)).toEqual(turquoise);
  await expect
    .poll(async () => (await savedArt(page))?.strokes.map((item) => item.tool))
    .toEqual(["brush", "eraser"]);
  expect((await savedArt(page))?.fills["bunny-6"]).toBe("#5DC9C5");
});

test("color by number rejects a mismatch and accepts the matching palette number", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Color by number/ }).click();
  await page
    .locator(".drawing-card")
    .filter({
      has: page.getByRole("heading", { name: "Happy bunny", exact: true }),
    })
    .click();
  await page
    .getByRole("button", { name: "Pink number 1", exact: true })
    .click();
  await tap(page, 167, 352); // This star is number 3.
  await expect(page.getByRole("status")).toContainText(
    "Find the color with the same number",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await expect.poll(async () => (await savedArt(page))?.fills).toEqual({});
  await page
    .getByRole("button", { name: "Yellow number 3", exact: true })
    .click();
  await tap(page, 167, 352);
  await expect.poll(() => pixel(page, 167, 352)).toEqual([255, 211, 92, 255]);
  await expect
    .poll(async () => (await savedArt(page))?.fills["bunny-14"])
    .toBe("#FFD35C");
  // The number label disappears: its center is now the selected solid fill.
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
});

test("stickers retain their selected emoji and canvas coordinates in local storage", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Free draw/ }).click();
  await page.getByRole("button", { name: "Stickers", exact: true }).click();
  await page.getByRole("button", { name: "Sticker 🌈", exact: true }).click();
  await tap(page, 400, 400);
  await expect
    .poll(async () => (await savedArt(page))?.stickers.length)
    .toBe(1);
  const placed = (await savedArt(page))!.stickers[0];
  expect(placed.emoji).toBe("🌈");
  expect(placed.x).toBeCloseTo(400, 0);
  expect(placed.y).toBeCloseTo(400, 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await savedArt(page))?.stickers).toEqual([]);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => (await savedArt(page))?.stickers[0]?.emoji)
    .toBe("🌈");
});

test("glow strokes have a bright core and a colored halo on a dark blank canvas", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Glow party/ }).click();
  await expect.poll(() => pixel(page, 400, 400)).toEqual([21, 40, 67, 255]);
  await page.getByRole("button", { name: "Turquoise", exact: true }).click();
  await stroke(page, [300, 400], [500, 400]);
  await expect
    .poll(async () => (await pixel(page, 400, 400))[0])
    .toBeGreaterThan(210);
  const halo = await pixel(page, 400, 418);
  expect(halo[1]).toBeGreaterThan(40);
  expect(halo[2]).toBeGreaterThan(67);
  expect(await pixel(page, 50, 50)).toEqual([21, 40, 67, 255]);
  await expect
    .poll(async () => (await savedArt(page))?.strokes[0]?.points.length)
    .toBeGreaterThan(2);
  expect((await savedArt(page))?.mode).toBe("glow");
  expect((await savedArt(page))?.drawingId).toBe("");
});

test("crayon and sparkle textures are identical after undo and redo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Free draw/ }).click();
  await page.getByRole("button", { name: "Purple", exact: true }).click();
  for (const [name, y] of [
    ["Crayon", 250],
    ["Sparkle", 500],
  ] as const) {
    await page.getByRole("button", { name, exact: true }).click();
    await stroke(page, [200, y], [600, y]);
    await expect
      .poll(async () => (await pixel(page, 400, y)).slice(0, 3))
      .not.toEqual([255, 255, 255]);
    const before = await canvas(page).evaluate((node) =>
      (node as HTMLCanvasElement).toDataURL(),
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => pixel(page, 400, y)).toEqual(white);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect
      .poll(() =>
        canvas(page).evaluate((node) =>
          (node as HTMLCanvasElement).toDataURL(),
        ),
      )
      .toBe(before);
  }
  await expect
    .poll(async () => (await savedArt(page))?.strokes.map((item) => item.tool))
    .toEqual(["crayon", "glitter"]);
});

test.describe("phone canvas", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  test("a finger tap hits the right shape on a scaled high density screen", async ({
    page,
  }) => {
    await bunny(page);
    await page.getByRole("button", { name: "Pink", exact: true }).tap();
    await tap(page, 167, 352, true);
    await expect.poll(() => pixel(page, 167, 352)).toEqual(pink);
    await expect
      .poll(async () => (await savedArt(page))?.fills["bunny-14"])
      .toBe("#FF6B79");
  });
});
