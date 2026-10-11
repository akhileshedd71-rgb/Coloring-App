import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openPicture(page: Page, title: string) {
  await page
    .locator(".drawing-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Coloring canvas" }),
  ).toBeVisible();
}

async function tapCanvas(page: Page, x: number, y: number) {
  const canvas = page.getByRole("img", { name: "Coloring canvas" });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Coloring canvas is not laid out");
  await canvas.click({
    position: { x: (x * box.width) / 800, y: (y * box.height) / 800 },
  });
}

async function canvasPixel(page: Page, x: number, y: number) {
  return page.locator("canvas").evaluate(
    (canvas: HTMLCanvasElement, point) => {
      const density = canvas.width / 800;
      return [
        ...canvas
          .getContext("2d")!
          .getImageData(
            Math.round(point.x * density),
            Math.round(point.y * density),
            1,
            1,
          ).data,
      ];
    },
    { x, y },
  );
}

async function enterParents(page: Page, tryWrongAnswer = false) {
  await page
    .getByRole("button", { name: "Grown-up corner", exact: true })
    .click();
  const gate = page.getByRole("dialog", {
    name: "Grown-up check",
    exact: true,
  });
  await expect(gate).toBeVisible();
  if (tryWrongAnswer) {
    await gate
      .getByRole("spinbutton", { name: "Answer to grown-up check" })
      .fill("0");
    await gate.getByRole("button", { name: "Open grown-up corner" }).click();
    await expect(
      gate.getByText("That’s not quite right. Let’s try again."),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Grown-up corner", exact: true }),
    ).toHaveCount(0);
  }
  const numbers = (await gate.locator(".gate-label").innerText()).match(/\d+/g);
  if (!numbers || numbers.length !== 2)
    throw new Error("Expected a two-number parent challenge");
  await gate
    .getByRole("spinbutton", { name: "Answer to grown-up check" })
    .fill(String(Number(numbers[0]) * Number(numbers[1])));
  await gate.getByRole("button", { name: "Open grown-up corner" }).click();
  await expect(
    page.getByRole("dialog", { name: "Grown-up corner", exact: true }),
  ).toBeVisible();
}

async function finishAndLeave(page: Page) {
  await page.getByRole("button", { name: "All done!", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your masterpiece is safe in My art",
  );
  await page
    .getByRole("button", { name: "Back to all pictures", exact: true })
    .click();
}

async function openGallery(page: Page, mobile = false) {
  if (mobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: /^My art \d+/ }).click();
  await expect(
    page.getByRole("heading", { name: "My happy little gallery" }),
  ).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.width);
}

test("the 35-page library supports all categories, search, and empty-state recovery", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".drawing-card")).toHaveCount(35);
  const categories = [
    "Animals",
    "Ocean",
    "Nature",
    "Space",
    "Yummy",
    "On the go",
    "Magic",
  ];
  for (const category of categories) {
    await page
      .locator(".category-row")
      .getByRole("button", { name: category })
      .click();
    await expect(page.locator(".drawing-card")).toHaveCount(5);
    await expect(page.locator(".drawing-card-info > div > span")).toHaveText(
      Array(5).fill(category),
    );
  }
  await page
    .locator(".category-row")
    .getByRole("button", { name: "All pictures" })
    .click();
  await page.getByRole("textbox", { name: "Find a picture" }).fill("BUNNY");
  await expect(page.locator(".drawing-card")).toHaveCount(1);
  await expect(page.locator(".drawing-card").getByRole("heading")).toHaveText(
    "Happy bunny",
  );
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator(".drawing-card")).toHaveCount(35);
  await page
    .getByRole("textbox", { name: "Find a picture" })
    .fill("not-a-real-picture");
  await expect(
    page.getByRole("heading", { name: "No pictures found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "See all pictures" }).click();
  await expect(page.locator(".drawing-card")).toHaveCount(35);
});

test("a colored picture and its gallery thumbnail survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await openPicture(page, "Happy bunny");
  await page.getByRole("button", { name: "Green", exact: true }).click();
  await tapCanvas(page, 400, 560);
  await expect
    .poll(() => canvasPixel(page, 400, 560))
    .toEqual([133, 204, 140, 255]);
  await finishAndLeave(page);
  await openGallery(page);
  await expect(page.locator(".saved-art-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Continue Happy bunny" }),
  ).toBeVisible();
  await expect(page.locator(".saved-art-image img")).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/,
  );
  await page.reload();
  await openGallery(page);
  await expect(page.locator(".saved-art-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Continue Happy bunny" }).click();
  await expect
    .poll(() => canvasPixel(page, 400, 560))
    .toEqual([133, 204, 140, 255]);
});

test("the parent gate protects profile creation and each artist has an independent gallery", async ({
  page,
}) => {
  await page.goto("/");
  await openPicture(page, "Happy bunny");
  await finishAndLeave(page);
  await enterParents(page, true);
  const parents = page.getByRole("dialog", {
    name: "Grown-up corner",
    exact: true,
  });
  await parents.getByRole("button", { name: "Choose avatar 🦊" }).click();
  await parents.getByRole("textbox", { name: "New artist name" }).fill("Maya");
  await parents
    .getByRole("button", { name: "Add artist", exact: true })
    .click();
  await expect(parents.locator(".profile-chips .selected")).toHaveText(
    "🦊Maya",
  );
  await parents.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".profile-button")).toContainText("Maya");
  await openGallery(page);
  await expect(page.locator(".saved-art-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your next masterpiece belongs here" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Make something" }).click();
  await openPicture(page, "Little kitten");
  await finishAndLeave(page);
  await openGallery(page);
  await expect(page.locator(".saved-art-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Continue Little kitten" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue Happy bunny" }),
  ).toHaveCount(0);
  await page.locator(".profile-button").click();
  await page
    .getByRole("dialog", { name: "Choose your artist" })
    .getByRole("button", { name: "Little artist" })
    .click();
  await expect(page.locator(".saved-art-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Continue Happy bunny" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue Little kitten" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".profile-button")).toContainText("Little artist");
  await page.locator(".profile-button").click();
  await page
    .getByRole("dialog", { name: "Choose your artist" })
    .getByRole("button", { name: "Maya" })
    .click();
  await openGallery(page);
  await expect(
    page.getByRole("button", { name: "Continue Little kitten" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue Happy bunny" }),
  ).toHaveCount(0);
});

test("easy-only difficulty hides the more detailed page and persists after reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page
      .locator(".drawing-card")
      .filter({
        has: page.getByRole("heading", { name: "Mermaid magic", exact: true }),
      }),
  ).toHaveCount(1);
  await enterParents(page);
  const parents = page.getByRole("dialog", {
    name: "Grown-up corner",
    exact: true,
  });
  await parents
    .getByRole("combobox", { name: "Picture difficulty" })
    .selectOption("easy");
  await parents.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".drawing-card")).toHaveCount(34);
  await expect(page.locator(".drawing-card .difficulty.medium")).toHaveCount(0);
  await expect(
    page
      .locator(".drawing-card")
      .filter({
        has: page.getByRole("heading", { name: "Mermaid magic", exact: true }),
      }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".drawing-card")).toHaveCount(34);
  await enterParents(page);
  await parents
    .getByRole("combobox", { name: "Picture difficulty" })
    .selectOption("all");
  await parents.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".drawing-card")).toHaveCount(35);
});

test.describe("phone layout", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("library, every painting tool, and the gallery remain reachable without page overflow", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".drawing-card")).toHaveCount(35);
    await expectNoHorizontalOverflow(page);
    await openPicture(page, "Happy bunny");
    await expectNoHorizontalOverflow(page);
    const tools = page.getByLabel("Painting tools");
    for (const name of [
      "Fill",
      "Brush",
      "Crayon",
      "Sparkle",
      "Stickers",
      "Eraser",
    ]) {
      const button = tools.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      const bounds = await button.boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
    }
    await tools.getByRole("button", { name: "Stickers", exact: true }).click();
    await page.getByRole("button", { name: "Sticker 🌸", exact: true }).click();
    await tapCanvas(page, 400, 560);
    await page
      .getByRole("button", { name: "Undo last action", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Redo last action", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Redo last action", exact: true })
      .click();
    await tools
      .getByRole("button", { name: "Start picture over", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Start fresh" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Keep creating", exact: true })
      .click();
    await expectNoHorizontalOverflow(page);
    await finishAndLeave(page);
    await openGallery(page, true);
    await expect(
      page.getByRole("button", { name: "Continue Happy bunny" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
