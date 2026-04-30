import { expect, test, type Locator, type Page } from "@playwright/test";

const mobileViewport = {
  width: 390,
  height: 844,
};

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

async function expectNoOverlap(a: Locator, b: Locator) {
  const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()]);

  expect(boxA).not.toBeNull();
  expect(boxB).not.toBeNull();
  expect(intersects(boxA!, boxB!)).toBe(false);
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test.use({
  viewport: mobileViewport,
  deviceScaleFactor: 3,
  isMobile: true,
});

test("home mobile header, stats, and safe-area spacing do not overlap", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const menuButton = page.getByRole("button", { name: /메뉴/ });
  const brand = page.getByText("Travel Map Diary").first();
  const title = page.getByRole("heading", { name: "서울 동 단위 여행 일기" });
  const statsRegion = page.locator('[data-testid="visit-stats"]');
  const aside = page.locator('[data-testid="mobile-side-panel"]');

  await expect(menuButton).toBeVisible();
  await expect(brand).toBeVisible();
  await expect(title).toBeVisible();
  await expect(statsRegion).toBeVisible();

  await expectNoOverlap(menuButton, brand);
  await expectNoOverlap(menuButton, title);
  await expectNoHorizontalOverflow(page);

  const statsBox = await statsRegion.boundingBox();
  expect(statsBox).not.toBeNull();
  expect(statsBox!.x).toBeGreaterThanOrEqual(0);
  expect(statsBox!.x + statsBox!.width).toBeLessThanOrEqual(mobileViewport.width + 1);

  const safePadding = await aside.evaluate((element) => getComputedStyle(element).paddingBottom);
  expect(Number.parseFloat(safePadding)).toBeGreaterThanOrEqual(16);

  await page.screenshot({ path: "test-results/mobile-home.png", fullPage: true });
});

for (const path of ["/login", "/signup"]) {
  test(`${path} mobile header does not sit under the menu`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const menuButton = page.getByRole("button", { name: /메뉴/ });
    const brand = page.getByText("Travel Map Diary").first();

    await expect(menuButton).toBeVisible();
    await expect(brand).toBeVisible();
    await expectNoOverlap(menuButton, brand);
    await expectNoHorizontalOverflow(page);

    await page.screenshot({
      path: path === "/login" ? "test-results/mobile-login.png" : "test-results/mobile-signup.png",
      fullPage: true,
    });
  });
}
