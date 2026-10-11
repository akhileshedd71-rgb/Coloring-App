import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openBunny(page: Page) {
  await page.goto("/");
  await page
    .locator(".drawing-card")
    .filter({
      has: page.getByRole("heading", { name: "Happy bunny", exact: true }),
    })
    .click();
  await expect(
    page.getByRole("img", { name: "Coloring canvas" }),
  ).toBeVisible();
}

async function colorBelly(page: Page) {
  await page.getByRole("button", { name: "Green", exact: true }).click();
  const canvas = page.getByRole("img", { name: "Coloring canvas" });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Coloring canvas is not laid out");
  await canvas.click({
    position: { x: (400 * box.width) / 800, y: (560 * box.height) / 800 },
  });
}

async function reopenAfterReload(page: Page) {
  // Reload immediately after the completed action, without waiting for autosave.
  await page.reload();
  await page.getByRole("button", { name: /^My art \d+/ }).click();
  await page
    .getByRole("button", { name: "Continue Happy bunny", exact: true })
    .click();
}

async function bellyPixel(page: Page) {
  return page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const density = canvas.width / 800;
    return [
      ...canvas
        .getContext("2d")!
        .getImageData(400 * density, 560 * density, 1, 1).data,
    ];
  });
}

test("the most recent color survives an immediate reload without pressing Done", async ({
  page,
}) => {
  await openBunny(page);
  await colorBelly(page);
  await reopenAfterReload(page);
  await expect.poll(() => bellyPixel(page)).toEqual([133, 204, 140, 255]);
});

test("undo survives an immediate reload instead of restoring the discarded color", async ({
  page,
}) => {
  await openBunny(page);
  await colorBelly(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await reopenAfterReload(page);
  await expect.poll(() => bellyPixel(page)).toEqual([255, 255, 255, 255]);
});

test("sharing requires the grown-up answer and exports a full-resolution PNG", async ({
  page,
}) => {
  await openBunny(page);
  await colorBelly(page);
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  const share = page.getByRole("button", {
    name: "Share or download picture",
    exact: true,
  });
  await share.click();
  const gate = page.getByRole("dialog", {
    name: "Grown-up check",
    exact: true,
  });
  await gate
    .getByRole("spinbutton", { name: "Answer to grown-up check" })
    .fill("0");
  await gate
    .getByRole("button", { name: "Share masterpiece", exact: true })
    .click();
  await expect(
    gate.getByText("That’s not quite right. Let’s try again."),
  ).toBeVisible();
  expect(downloads).toBe(0);
  await gate.getByRole("button", { name: "Close dialog" }).click();
  await expect(gate).toHaveCount(0);
  expect(downloads).toBe(0);

  await share.click();
  const numbers = (await gate.locator(".gate-label").innerText()).match(/\d+/g);
  if (!numbers || numbers.length !== 2)
    throw new Error("Expected two numbers in the grown-up challenge");
  await gate
    .getByRole("spinbutton", { name: "Answer to grown-up check" })
    .fill(String(Number(numbers[0]) * Number(numbers[1])));
  const downloaded = page.waitForEvent("download");
  await gate
    .getByRole("button", { name: "Share masterpiece", exact: true })
    .click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^happy-bunny-\d+\.png$/);
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  if (!path) throw new Error("PNG download was not available");
  const png = await readFile(path);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const canvasSize = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(canvasSize);
  expect(canvasSize[0]).toBeGreaterThanOrEqual(800);
  await expect(gate).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Grown-up corner", exact: true }),
  ).toHaveCount(0);
  expect(downloads).toBe(1);
});
