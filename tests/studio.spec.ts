import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Artwork, Drawing } from "../src/types";

const turquoise = [93, 201, 197, 255];
const white = [255, 255, 255, 255];
const outline = [57, 76, 80, 255];

function canvas(page: Page) {
  return page.getByRole("img", { name: "Coloring canvas", exact: true });
}

async function openPicture(page: Page, title = "Happy bunny") {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Find a picture" }).fill(title);
  await page
    .locator(".drawing-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .click();
  await expect(canvas(page)).toBeVisible();
}

async function pixel(page: Page, x: number, y: number) {
  return canvas(page).evaluate(
    (node, point) => {
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
    },
    [x, y],
  );
}

async function screenPoint(page: Page, x: number, y: number) {
  const bounds = await canvas(page).boundingBox();
  if (!bounds) throw new Error("Canvas must be visible before painting");
  return {
    x: bounds.x + (x * bounds.width) / 800,
    y: bounds.y + (y * bounds.height) / 800,
  };
}

async function dispatchTap(page: Page, x: number, y: number) {
  const point = await screenPoint(page, x, y);
  await canvas(page).dispatchEvent("pointerdown", {
    clientX: point.x,
    clientY: point.y,
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
  });
}

async function savedArtwork(page: Page): Promise<Artwork | undefined> {
  return page.evaluate(async () => {
    const entries = await new Promise<Artwork[]>((resolve, reject) => {
      const request = indexedDB.open("little-color-club-art", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const query = database
          .transaction("artworks")
          .objectStore("artworks")
          .getAll();
        query.onsuccess = () => {
          database.close();
          resolve(query.result);
        };
        query.onerror = () => {
          database.close();
          reject(query.error);
        };
      };
    });
    return entries.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  });
}

async function imagePixel(page: Page, source: string, x: number, y: number) {
  return page.evaluate(
    async ({ source, x, y }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const exported = document.createElement("canvas");
      exported.width = image.naturalWidth;
      exported.height = image.naturalHeight;
      const context = exported.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const density = exported.width / 800;
      return [
        ...context.getImageData(
          Math.round(x * density),
          Math.round(y * density),
          1,
          1,
        ).data,
      ];
    },
    { source, x, y },
  );
}

test("zooming and dragging explore the picture without painting, then Fit restores the page", async ({
  page,
}) => {
  await openPicture(page);
  const originalWidth = (await canvas(page).boundingBox())!.width;
  const fit = page.getByRole("button", {
    name: "Fit picture to canvas",
    exact: true,
  });
  const viewport = page.locator(".canvas-viewport");
  const beforeImage = await canvas(page).evaluate((node) =>
    (node as HTMLCanvasElement).toDataURL(),
  );
  await expect(fit).toHaveText("100%");
  await expect(
    page.getByRole("button", { name: "Zoom out", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(fit).toHaveText("200%");
  expect((await canvas(page).boundingBox())!.width).toBeCloseTo(
    originalWidth * 2,
    0,
  );
  await page.getByRole("button", { name: "Move picture", exact: true }).click();
  const before = await viewport.evaluate((node) => ({
    x: node.scrollLeft,
    y: node.scrollTop,
  }));
  const bounds = (await viewport.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * 0.65,
    bounds.y + bounds.height * 0.65,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.35,
    bounds.y + bounds.height * 0.35,
    { steps: 8 },
  );
  await page.mouse.up();
  const after = await viewport.evaluate((node) => ({
    x: node.scrollLeft,
    y: node.scrollTop,
  }));
  expect(after.x).toBeGreaterThan(before.x + 30);
  expect(after.y).toBeGreaterThan(before.y + 30);
  expect(
    await canvas(page).evaluate((node) =>
      (node as HTMLCanvasElement).toDataURL(),
    ),
  ).toBe(beforeImage);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Continue coloring", exact: true })
    .click();
  await expect(page.locator(".canvas-pan-layer")).toHaveCount(0);
  await fit.click();
  await expect(fit).toHaveText("100%");
  await expect(
    page.getByRole("button", { name: "Zoom out", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Move picture", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() => viewport.evaluate((node) => [node.scrollLeft, node.scrollTop]))
    .toEqual([0, 0]);
  expect((await canvas(page).boundingBox())!.width).toBeCloseTo(
    originalWidth,
    0,
  );
});

test("a zoomed tap colors the intended region and keeps its artwork coordinates", async ({
  page,
}) => {
  await openPicture(page);
  await page.getByRole("button", { name: "Turquoise", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const point = await screenPoint(page, 395, 560);
  const viewport = (await page.locator(".canvas-viewport").boundingBox())!;
  expect(point.x).toBeGreaterThan(viewport.x);
  expect(point.x).toBeLessThan(viewport.x + viewport.width);
  expect(point.y).toBeGreaterThan(viewport.y);
  expect(point.y).toBeLessThan(viewport.y + viewport.height);
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => pixel(page, 395, 560)).toEqual(turquoise);
  await expect
    .poll(async () => (await savedArtwork(page))?.fills)
    .toEqual({ "bunny-6": "#5DC9C5" });
  expect(await pixel(page, 167, 352)).toEqual(white);
  await page
    .getByRole("button", { name: "Fit picture to canvas", exact: true })
    .click();
  expect(await pixel(page, 395, 560)).toEqual(turquoise);
});

test("a color bloom saves and exports its final color before the visual animation finishes", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await openPicture(page);
  await page.getByRole("button", { name: "Turquoise", exact: true }).click();
  // Freeze just the test clock so the 280ms bloom cannot finish while we share.
  await page.clock.pauseAt(new Date("2026-01-01T00:10:00Z"));
  await dispatchTap(page, 395, 560);
  expect(await pixel(page, 420, 600)).toEqual(white);
  await expect
    .poll(async () => (await savedArtwork(page))?.fills["bunny-6"])
    .toBe("#5DC9C5");
  await expect
    .poll(async () => {
      const thumbnail = (await savedArtwork(page))?.thumbnail;
      return thumbnail ? imagePixel(page, thumbnail, 420, 600) : [];
    })
    .toEqual(turquoise);

  await page
    .getByRole("button", { name: "Share or download picture", exact: true })
    .click();
  const gate = page.getByRole("dialog", {
    name: "Grown-up check",
    exact: true,
  });
  const numbers = (await gate.locator(".gate-label").innerText()).match(
    /\d+/g,
  )!;
  await gate
    .getByRole("spinbutton", { name: "Answer to grown-up check" })
    .fill(String(Number(numbers[0]) * Number(numbers[1])));
  const downloading = page.waitForEvent("download");
  await gate
    .getByRole("button", { name: "Share masterpiece", exact: true })
    .click();
  const download = await downloading;
  const path = await download.path();
  expect(path).toBeTruthy();
  const png = await readFile(path!);
  expect(
    await imagePixel(
      page,
      `data:image/png;base64,${png.toString("base64")}`,
      420,
      600,
    ),
  ).toEqual(turquoise);
  // Export must neither capture the old color nor alter the visible animation.
  expect(await pixel(page, 420, 600)).toEqual(white);
  await page.clock.runFor(320);
  expect(await pixel(page, 420, 600)).toEqual(turquoise);
});

test("reduced motion fills immediately without sparkles or a color bloom", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPicture(page);
  await page.getByRole("button", { name: "Turquoise", exact: true }).click();
  await dispatchTap(page, 395, 560);
  expect(await pixel(page, 420, 600)).toEqual(turquoise);
  await expect(page.locator("[data-paint-feedback]")).toHaveCount(0);
  await expect
    .poll(async () => (await savedArtwork(page))?.fills["bunny-6"])
    .toBe("#5DC9C5");
});

test("an illustrated page has paintable regions and its original ink survives brush strokes", async ({
  page,
}) => {
  await openPicture(page, "Penguin Wave");
  const response = await page.request.get(
    "/drawings/illustrated-woodland-02.json",
  );
  expect(response.ok()).toBeTruthy();
  const drawing: Drawing = await response.json();
  expect(drawing.ink).toBeTruthy();
  expect(drawing.regions.length).toBeGreaterThan(1);
  const region = [...drawing.regions]
    .filter((item) => item.label)
    .sort((a, b) => (b.labelRadius ?? 0) - (a.labelRadius ?? 0))[0];
  const [x, y] = region.label!;
  expect(await pixel(page, x, y)).toEqual(white);
  const inkPoint = await canvas(page).evaluate((node) => {
    const surface = node as HTMLCanvasElement;
    const context = surface.getContext("2d")!;
    const data = context.getImageData(0, 0, surface.width, surface.height).data;
    for (let y = 50; y < surface.height - 50; y += 2) {
      for (let x = 50; x < surface.width - 50; x += 2) {
        const index = (y * surface.width + x) * 4;
        if (
          data[index] === 57 &&
          data[index + 1] === 76 &&
          data[index + 2] === 80
        )
          return [(x * 800) / surface.width, (y * 800) / surface.height];
      }
    }
    throw new Error("Expected the generated illustration's visible ink");
  });
  await page.getByRole("button", { name: "Turquoise", exact: true }).click();
  await dispatchTap(page, x, y);
  await expect.poll(() => pixel(page, x, y)).toEqual(turquoise);
  await expect
    .poll(async () => (await savedArtwork(page))?.fills[region.id])
    .toBe("#5DC9C5");
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  const brushPoint = await screenPoint(page, inkPoint[0], inkPoint[1]);
  await page.mouse.click(brushPoint.x, brushPoint.y);
  await expect
    .poll(async () => (await savedArtwork(page))?.strokes.length)
    .toBe(1);
  expect(await pixel(page, inkPoint[0], inkPoint[1])).toEqual(outline);
});

test.describe("phone studio", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  test("finger painting remains accurate after zooming on a small high density screen", async ({
    page,
  }) => {
    await openPicture(page);
    await page.getByRole("button", { name: "Turquoise", exact: true }).tap();
    await page.getByRole("button", { name: "Zoom in", exact: true }).tap();
    await page.getByRole("button", { name: "Zoom in", exact: true }).tap();
    const point = await screenPoint(page, 395, 560);
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(() => pixel(page, 395, 560)).toEqual(turquoise);
    await expect
      .poll(async () => (await savedArtwork(page))?.fills)
      .toEqual({ "bunny-6": "#5DC9C5" });
    expect(await pixel(page, 167, 352)).toEqual(white);
  });
});

test("a cancelled late picture load cannot evict the illustration currently being colored", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const catalog: Drawing[] = JSON.parse(
    await readFile("src/data/illustrated.json", "utf8"),
  );
  const pictures = catalog.slice(0, 9);
  expect(pictures).toHaveLength(9);
  const first: Drawing = JSON.parse(
    await readFile(`public${pictures[0].asset}`, "utf8"),
  );
  const paintRegion = [...first.regions]
    .filter((region) => region.label)
    .sort((a, b) => (b.labelRadius ?? 0) - (a.labelRadius ?? 0))[0];
  await page.goto("/");
  async function choosePicture(title: string) {
    await page.getByRole("textbox", { name: "Find a picture" }).fill(title);
    await page
      .locator(".drawing-card")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .click();
  }
  // Fill the bounded detail cache through the normal browsing workflow.
  for (const picture of pictures.slice(0, 8)) {
    await choosePicture(picture.title);
    await expect(canvas(page)).toBeVisible();
    await page
      .getByRole("button", { name: "Back to all pictures", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Find a picture" }),
    ).toBeVisible();
  }

  const delayedAsset = pictures[8].asset!;
  let releaseRequest!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route(`**${delayedAsset}`, async (route) => {
    await release;
    await route.continue();
  });
  try {
    const requested = page.waitForRequest((request) =>
      request.url().endsWith(delayedAsset),
    );
    await choosePicture(pictures[8].title);
    await requested;
    await page
      .getByRole("button", { name: "Back to pictures", exact: true })
      .click();
    await choosePicture(first.title);
    await expect(canvas(page)).toBeVisible();
    const before = await canvas(page).evaluate((node) =>
      (node as HTMLCanvasElement).toDataURL(),
    );

    const completed = page.waitForResponse((response) =>
      response.url().endsWith(delayedAsset),
    );
    releaseRequest();
    await (await completed).finished();
    // A normal toolbar change must retain the pinned illustration even after
    // the cancelled request finishes and rotates the library's detail cache.
    await page.getByRole("button", { name: "Turquoise", exact: true }).click();
    expect(
      await canvas(page).evaluate((node) =>
        (node as HTMLCanvasElement).toDataURL(),
      ),
    ).toBe(before);
    const [x, y] = paintRegion.label!;
    await dispatchTap(page, x, y);
    await expect.poll(() => pixel(page, x, y)).toEqual(turquoise);
    await expect
      .poll(async () => (await savedArtwork(page))?.fills[paintRegion.id])
      .toBe("#5DC9C5");
  } finally {
    releaseRequest();
  }
});
