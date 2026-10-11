import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { categories, drawings } from "../src/data/drawings";
import { PALETTE } from "../src/types";
import type { Artwork, Drawing, Region } from "../src/types";

const illustrated = drawings.filter(
  (drawing) => drawing.source === "illustrated",
);
const white = [255, 255, 255, 255];
const turquoise = [93, 201, 197, 255];

function detail(drawing: Drawing): Drawing {
  return JSON.parse(
    readFileSync(resolve("public", drawing.asset!.slice(1)), "utf8"),
  );
}

function roomyRegion(drawing: Drawing): Region {
  return [...drawing.regions].sort(
    (a, b) => (b.labelRadius ?? 0) - (a.labelRadius ?? 0),
  )[0];
}

function surface(page: Page) {
  return page.getByRole("img", { name: "Coloring canvas", exact: true });
}

async function openPicture(page: Page, drawing: Drawing) {
  await page
    .getByRole("textbox", { name: "Find a picture" })
    .fill(drawing.title);
  await page
    .getByRole("button", {
      name: `${drawing.title}, ${drawing.difficulty}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: drawing.title, exact: true }),
  ).toBeVisible();
  await expect(surface(page)).toBeVisible();
}

async function tap(page: Page, point: [number, number]) {
  const bounds = (await surface(page).boundingBox())!;
  await surface(page).click({
    position: {
      x: (point[0] * bounds.width) / 800,
      y: (point[1] * bounds.height) / 800,
    },
  });
}

async function pixel(page: Page, point: [number, number]) {
  return surface(page).evaluate((node, position) => {
    const canvas = node as HTMLCanvasElement;
    return [
      ...canvas
        .getContext("2d")!
        .getImageData(
          Math.round((position[0] * canvas.width) / 800),
          Math.round((position[1] * canvas.height) / 800),
          1,
          1,
        ).data,
    ];
  }, point);
}

async function savedArtwork(
  page: Page,
  drawingId: string,
): Promise<Artwork | undefined> {
  return page.evaluate(
    async (id) =>
      new Promise<Artwork | undefined>((resolve, reject) => {
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
            resolve(
              (get.result as Artwork[])
                .filter((art) => art.drawingId === id)
                .sort((a, b) => b.updatedAt - a.updatedAt)[0],
            );
          };
          get.onerror = () => {
            database.close();
            reject(get.error);
          };
        };
      }),
    drawingId,
  );
}

test("at least 100 distinct illustrated pictures have complete offline assets and all three difficulties", async () => {
  expect(illustrated.length).toBeGreaterThanOrEqual(100);
  expect(new Set(drawings.map((drawing) => drawing.id)).size).toBe(
    drawings.length,
  );
  expect(
    new Set(drawings.map((drawing) => drawing.title.toLowerCase())).size,
  ).toBe(drawings.length);
  expect(
    new Set(illustrated.map((drawing) => drawing.category)).size,
  ).toBeGreaterThanOrEqual(8);
  expect(new Set(illustrated.map((drawing) => drawing.difficulty))).toEqual(
    new Set(["easy", "medium", "hard"]),
  );
  expect(new Set(categories)).toEqual(
    new Set(drawings.map((drawing) => drawing.category)),
  );
  const silhouettes = new Set<string>();
  for (const drawing of illustrated) {
    expect(drawing.regions, `${drawing.id}: lightweight catalog`).toEqual([]);
    const full = detail(drawing);
    expect(full.id).toBe(drawing.id);
    expect(full.title).toBe(drawing.title);
    expect(full.category).toBe(drawing.category);
    expect(full.difficulty).toBe(drawing.difficulty);
    expect(full.regions.length).toBe(drawing.regionCount);
    expect(full.regions.length).toBeGreaterThan(0);
    expect(new Set(full.regions.map((region) => region.id)).size).toBe(
      full.regions.length,
    );
    expect(
      full.ink?.length,
      `${drawing.id}: visible original line art`,
    ).toBeGreaterThan(0);
    silhouettes.add(createHash("sha256").update(full.ink!).digest("hex"));
    expect(
      readFileSync(resolve("public", drawing.thumbnail!.slice(1)), "utf8"),
    ).toContain("<svg");
    // Report per page to keep thousands of region checks from producing
    // hundreds of thousands of Playwright trace steps.
    const invalidRegions: string[] = [];
    for (const region of full.regions) {
      if (!region.d.length) invalidRegions.push(`${region.id}: empty path`);
      if (
        !Number.isInteger(region.number) ||
        region.number < 1 ||
        region.number > PALETTE.length
      )
        invalidRegions.push(`${region.id}: invalid number`);
      if (region.color.toUpperCase() !== PALETTE[region.number - 1])
        invalidRegions.push(
          `${region.id}: palette color does not match number`,
        );
      if (
        region.label?.length !== 2 ||
        !region.label.every(
          (coordinate) =>
            Number.isFinite(coordinate) && coordinate > 0 && coordinate < 800,
        )
      )
        invalidRegions.push(`${region.id}: invalid label position`);
    }
    expect(invalidRegions, drawing.id).toEqual([]);
  }
  expect(silhouettes.size, "Every new picture has different line art").toBe(
    illustrated.length,
  );
});

test("every illustrated number label is inside its fillable shape and outside the outline", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const audit = await page.evaluate(async (catalog) => {
    const context = document.createElement("canvas").getContext("2d")!;
    const problems: string[] = [];
    let regionCount = 0;
    for (const item of catalog) {
      const response = await fetch(item.asset!);
      if (!response.ok) {
        problems.push(`${item.id}: missing detail asset`);
        continue;
      }
      const drawing = (await response.json()) as Drawing;
      const ink = new Path2D(drawing.ink!);
      for (const region of drawing.regions) {
        const path = new Path2D(region.d);
        const [x, y] = region.label!;
        regionCount++;
        if (!context.isPointInPath(path, x, y, "evenodd"))
          problems.push(`${region.id}: label outside shape`);
        if (context.isPointInPath(ink, x, y, "evenodd"))
          problems.push(`${region.id}: label on illustration ink`);
        // The white margin is not a coloring region. An exterior contour here
        // would make a single tap flood the entire page around the subject.
        if (
          [
            [4, 4],
            [796, 4],
            [4, 796],
            [796, 796],
          ].some(([cx, cy]) => context.isPointInPath(path, cx, cy, "evenodd"))
        ) {
          problems.push(`${region.id}: includes exterior page margin`);
        }
      }
      const thumbnail = new Image();
      thumbnail.src = item.thumbnail!;
      try {
        await thumbnail.decode();
      } catch {
        problems.push(`${item.id}: thumbnail cannot be decoded`);
      }
      if (!thumbnail.naturalWidth || !thumbnail.naturalHeight)
        problems.push(`${item.id}: empty thumbnail`);
    }
    return { problems, regionCount };
  }, illustrated);
  expect(audit.problems).toEqual([]);
  expect(audit.regionCount).toBeGreaterThan(illustrated.length);
});

test("the library fetches detailed artwork only when its picture is opened", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (/\/drawings\/[^/]+\.json(?:\?|$)/.test(request.url()))
      requested.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await expect(page.locator(".drawing-card")).toHaveCount(24);
  expect(requested).toEqual([]);
  const target = illustrated[0];
  await openPicture(page, target);
  expect(requested).toEqual([target.asset]);
  await expect(
    page.getByLabel(`0 of ${target.regionCount} spaces colored`, {
      exact: true,
    }),
  ).toBeVisible();
});

for (const difficulty of ["easy", "medium", "hard"] as const) {
  test(`an illustrated ${difficulty} picture fills one shape, supports undo, and survives a gallery reload`, async ({
    page,
  }) => {
    const target = illustrated.find(
      (drawing) => drawing.difficulty === difficulty,
    )!;
    const full = detail(target);
    const region = roomyRegion(full);
    await page.goto("/");
    await page
      .getByRole("group", { name: "Drawing difficulty" })
      .getByRole("button", { name: new RegExp(`^${difficulty}$`, "i") })
      .click();
    await openPicture(page, target);
    await expect.poll(() => pixel(page, region.label!)).toEqual(white);
    await page.getByRole("button", { name: "Turquoise", exact: true }).click();
    await tap(page, region.label!);
    await expect.poll(() => pixel(page, region.label!)).toEqual(turquoise);
    await expect(
      page.getByLabel(`1 of ${full.regions.length} spaces colored`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect.poll(() => pixel(page, [4, 4])).toEqual(white);
    await expect
      .poll(async () => (await savedArtwork(page, target.id))?.fills)
      .toEqual({ [region.id]: "#5DC9C5" });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => pixel(page, region.label!)).toEqual(white);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(() => pixel(page, region.label!)).toEqual(turquoise);
    await page.getByRole("button", { name: "All done!", exact: true }).click();
    await expect(
      page.getByRole("dialog", {
        name: "Your little masterpiece",
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(async () => (await savedArtwork(page, target.id))?.thumbnail)
      .toMatch(/^data:image\/png;base64,/);
    await page.reload();
    await page.getByRole("button", { name: /^My art \d+/ }).click();
    await page
      .getByRole("button", { name: `Continue ${target.title}`, exact: true })
      .click();
    await expect(surface(page)).toBeVisible();
    await expect.poll(() => pixel(page, region.label!)).toEqual(turquoise);
    await expect(
      page.getByLabel(`1 of ${full.regions.length} spaces colored`, {
        exact: true,
      }),
    ).toBeVisible();
    expect((await savedArtwork(page, target.id))?.fills).toEqual({
      [region.id]: "#5DC9C5",
    });
  });
}

test("illustrated color-by-number rejects a mismatch, then removes the number after a correct fill", async ({
  page,
}) => {
  const target = illustrated.find(
    (drawing) => drawing.difficulty === "medium",
  )!;
  const full = detail(target);
  const region = roomyRegion(full);
  const otherNumber = full.regions.find(
    (other) => other.number !== region.number,
  )!.number;
  await page.goto("/");
  await page.getByRole("button", { name: /Color by number/ }).click();
  await openPicture(page, target);
  await page
    .getByRole("button", { name: new RegExp(` number ${otherNumber}$`) })
    .click();
  await tap(page, region.label!);
  await expect(page.getByRole("status")).toContainText(
    "Find the color with the same number",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(async () => (await savedArtwork(page, target.id))?.fills)
    .toEqual({});
  await page
    .getByRole("button", { name: new RegExp(` number ${region.number}$`) })
    .click();
  await tap(page, region.label!);
  const color = PALETTE[region.number - 1];
  const rgba = [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
    255,
  ];
  await expect.poll(() => pixel(page, region.label!)).toEqual(rgba);
  await expect
    .poll(async () => (await savedArtwork(page, target.id))?.fills)
    .toEqual({ [region.id]: color });
});

test("cancelling a slow illustrated page cannot replace the next picture", async ({
  page,
}) => {
  const target = illustrated[0];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${target.asset}`, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "Find a picture" })
      .fill(target.title);
    await page
      .getByRole("button", {
        name: `${target.title}, ${target.difficulty}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Opening a little adventure…",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Back to pictures", exact: true })
      .click();
    const classic = drawings.find((drawing) => drawing.id === "bunny")!;
    await openPicture(page, classic);
    const response = page.waitForResponse(
      (response) => new URL(response.url()).pathname === target.asset,
    );
    release();
    await (await response).finished();
    // Wait for the resolved fetch and its microtasks to finish before checking
    // the cancellation token, without relying on a fixed network delay.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(
      page.getByRole("heading", { name: classic.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: target.title, exact: true }),
    ).toHaveCount(0);
    await expect(surface(page)).toBeVisible();
  } finally {
    release();
  }
});
