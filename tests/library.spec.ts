import { expect, test } from "@playwright/test";
import { categories, drawings } from "../src/data/drawings";

const libraryStateKey = "little-color-club.library.v2";

test("library loads pages in batches and keeps the expanded list after coloring", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".drawing-card")).toHaveCount(
    Math.min(24, drawings.length),
  );
  await expect(page.locator(".dl-results-heading")).toContainText(
    `Showing 24 of ${drawings.length} pictures`,
  );
  await page.getByRole("button", { name: "More little adventures" }).click();
  const expandedCount = Math.min(48, drawings.length);
  await expect(page.locator(".drawing-card")).toHaveCount(expandedCount);
  const title = await page.locator(".drawing-card h3").last().innerText();
  await page.locator(".drawing-card").last().click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Coloring canvas" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to all pictures", exact: true })
    .click();
  await expect(page.locator(".drawing-card")).toHaveCount(expandedCount);
  await expect(page.locator(".drawing-card h3").last()).toHaveText(title);
});

test("easy, medium, and hard filters show their actual page totals", async ({
  page,
}) => {
  await page.goto("/");
  const filters = page.getByRole("group", { name: "Drawing difficulty" });
  for (const level of ["easy", "medium", "hard"] as const) {
    const expected = drawings.filter(
      (drawing) => drawing.difficulty === level,
    ).length;
    await filters
      .getByRole("button", { name: new RegExp(`^${level}$`, "i") })
      .click();
    await expect(page.locator(".drawing-card")).toHaveCount(
      Math.min(24, expected),
    );
    await expect(page.locator(".dl-results-heading")).toContainText(
      `Showing ${Math.min(24, expected)} of ${expected} pictures`,
    );
    await expect(
      page.locator(`.drawing-card .difficulty:not(.${level})`),
    ).toHaveCount(0);
  }
  await filters
    .getByRole("button", { name: "All levels", exact: true })
    .click();
  await expect(page.locator(".drawing-card")).toHaveCount(
    Math.min(24, drawings.length),
  );
});

test("category and search compose, recover from empty results, and survive a studio visit", async ({
  page,
}) => {
  await page.goto("/");
  for (const category of categories) {
    const expected = drawings.filter(
      (drawing) => drawing.category === category,
    ).length;
    await page
      .getByRole("group", { name: "Picture categories" })
      .getByRole("button", { name: category, exact: true })
      .click();
    await expect(page.locator(".drawing-card")).toHaveCount(
      Math.min(24, expected),
    );
    await expect(page.locator(".drawing-card-info > div > span")).toHaveText(
      Array(Math.min(24, expected)).fill(category),
    );
  }
  const target = drawings.find((drawing) => drawing.difficulty === "easy")!;
  await page
    .getByRole("group", { name: "Picture categories" })
    .getByRole("button", { name: target.category, exact: true })
    .click();
  await page
    .getByRole("group", { name: "Drawing difficulty" })
    .getByRole("button", { name: "Easy", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Find a picture" })
    .fill(target.title.toUpperCase());
  const targetCard = page.getByRole("button", {
    name: `${target.title}, easy`,
    exact: true,
  });
  await expect(targetCard).toBeVisible();
  await targetCard.click();
  await page
    .getByRole("button", { name: "Back to all pictures", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Find a picture" }),
  ).toHaveValue(target.title.toUpperCase());
  await expect(
    page
      .getByRole("group", { name: "Drawing difficulty" })
      .getByRole("button", { name: "Easy", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("group", { name: "Picture categories" })
      .getByRole("button", { name: target.category, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(targetCard).toBeVisible();
  await page
    .getByRole("textbox", { name: "Find a picture" })
    .fill("there-is-no-such-picture");
  await expect(
    page.getByRole("heading", { name: "No pictures found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "See all pictures" }).click();
  await expect(page.locator(".drawing-card")).toHaveCount(
    Math.min(24, drawings.length),
  );
});

test("unavailable session storage does not block library filtering", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".drawing-card")).toHaveCount(
    Math.min(24, drawings.length),
  );
  await page
    .getByRole("textbox", { name: "Find a picture" })
    .fill("there-is-no-such-picture");
  await expect(
    page.getByRole("heading", { name: "No pictures found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "See all pictures" }).click();
  await expect(page.locator(".drawing-card")).toHaveCount(
    Math.min(24, drawings.length),
  );
});

test("invalid saved filters fall back to a usable library", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        query: 7,
        category: "removed category",
        level: "super-hard",
        pagination: { key: "", limit: -5 },
      }),
    );
  }, libraryStateKey);
  await page.goto("/");
  await expect(page.locator(".drawing-card")).toHaveCount(
    Math.min(24, drawings.length),
  );
  await expect(
    page.getByRole("textbox", { name: "Find a picture" }),
  ).toHaveValue("");
  await expect(
    page
      .getByRole("group", { name: "Drawing difficulty" })
      .getByRole("button", { name: "All levels", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a parent difficulty limit overrides a previously saved hard filter", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        query: "",
        category: "All pictures",
        level: "hard",
        pagination: { key: "\u0000All pictures\u0000hard", limit: 48 },
      }),
    );
    localStorage.setItem(
      "little-color-club",
      JSON.stringify({
        settings: { difficulty: "easy", sound: false, hints: true },
      }),
    );
  }, libraryStateKey);
  await page.goto("/");
  const expected = drawings.filter(
    (drawing) => drawing.difficulty === "easy",
  ).length;
  await expect(page.locator(".drawing-card")).toHaveCount(
    Math.min(24, expected),
  );
  await expect(
    page.locator(".drawing-card .difficulty:not(.easy)"),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("group", { name: "Drawing difficulty" })
      .getByRole("button", { name: "Easy", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("group", { name: "Drawing difficulty" })
      .getByRole("button", { name: "Hard", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".dl-parent-note")).toContainText("easy pictures");
});

test("library remains usable on a small Android viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.width);
  for (const button of await page
    .locator(".dl-level, .dl-categories button")
    .all()) {
    const bounds = await button.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await page
    .getByRole("group", { name: "Drawing difficulty" })
    .getByRole("button", { name: "Hard", exact: true })
    .click();
  const hardCount = drawings.filter(
    (drawing) => drawing.difficulty === "hard",
  ).length;
  await expect(page.locator(".drawing-card")).toHaveCount(
    Math.min(24, hardCount),
  );
});
