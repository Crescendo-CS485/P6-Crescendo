/**
 * Crescendo Integration Tests
 *
 * Run locally (Vite + Flask must be running):
 *   cd frontend && npx playwright test
 *
 * Run against deployed AWS stack:
 *   BASE_URL=https://main.d291kg32gzfrfc.amplifyapp.com cd frontend && npx playwright test
 *
 * Tests marked [DEPLOYED ONLY] require the full AWS stack and are skipped locally.
 */

import { test, expect, Page } from "@playwright/test";

const IS_DEPLOYED = (process.env.BASE_URL ?? "").includes("amplifyapp.com");

// ---------------------------------------------------------------------------
// Test account credentials
// ---------------------------------------------------------------------------
// RUN_ID ensures no collision between parallel CI runs against the same DB.
const RUN_ID = Date.now().toString(36);

// The shared account used by most auth tests (registered by test 3.1)
const TEST_EMAIL = `integ_${RUN_ID}@crescendo.test`;
const TEST_PASSWORD = "Test1234!";
const TEST_DISPLAY = `IntegUser_${RUN_ID}`;
const TEST_HANDLE = `integ_${RUN_ID}`;

// A second throw-away account for test 2.4 so it doesn't exhaust the shared one
const POST_EMAIL = `post_${RUN_ID}@crescendo.test`;
const POST_DISPLAY = `PostUser_${RUN_ID}`;
const POST_HANDLE = `post_${RUN_ID}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Open the Join modal and register an account. */
async function registerAccount(
  page: Page,
  opts: { email: string; password: string; display: string; handle: string }
) {
  await page.locator("header").getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("#join-display-name").fill(opts.display);
  await page.locator("#join-handle").fill(opts.handle);
  await page.locator("#join-email").fill(opts.email);
  await page.locator("#join-password").fill(opts.password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/register") && r.status() === 201),
    page.locator('[role="dialog"] button[type="submit"]').click(),
  ]);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(opts.display)).toBeVisible();
}

/** Open the Sign In modal and sign in with email/password. */
async function signIn(page: Page, email: string, password: string) {
  await page.locator("header").getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("#signin-email").fill(email);
  await page.locator("#signin-password").fill(password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.status() === 200),
    page.locator('[role="dialog"] button[type="submit"]').click(),
  ]);
}

/** Go to "/" and wait for the artist list to load. */
async function gotoHome(page: Page) {
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/artists") && !r.url().includes("/discussions") && r.status() === 200
    ),
    page.goto("/"),
  ]);
}

// ---------------------------------------------------------------------------
// 1. Discovery Page — Artist Feed
// ---------------------------------------------------------------------------

test.describe("Discovery Page — Artist Feed", () => {
  test("1.1 loads the default artist list from /api/artists", async ({ page }) => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/artists") && !r.url().includes("/discussions") && r.status() === 200
      ),
      page.goto("/"),
    ]);

    const body = await response.json();
    expect(body.artists.length).toBeGreaterThan(0);
    await expect(page.getByText(body.artists[0].name as string).first()).toBeVisible();
  });

  test("1.2 genre filter button re-fetches with ?genre= and narrows results", async ({ page }) => {
    await gotoHome(page);

    // Genre chips on DiscoveryPage have aria-pressed
    const genreButton = page.locator("button[aria-pressed]").first();
    await expect(genreButton).toBeVisible();
    const genreLabel = ((await genreButton.textContent()) ?? "").trim();

    const [filteredResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("genre=") && r.status() === 200),
      genreButton.click(),
    ]);

    expect(filteredResp.url()).toContain("genre=");
    const body = await filteredResp.json();
    for (const artist of body.artists) {
      expect(
        (artist.genres as string[]).map((g: string) => g.toLowerCase()).includes(genreLabel.toLowerCase())
      ).toBeTruthy();
    }
  });

  test("1.3 Active Discussions toggle filters to artists with activityScore >= 8.5", async ({ page }) => {
    await gotoHome(page);

    // The switch has id="active-discussions" and role="switch"
    const toggle = page.locator('[role="switch"]').first();
    if (!(await toggle.isVisible())) { test.skip(); return; }

    const [filteredResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("active_discussions=true") && r.status() === 200),
      toggle.click(),
    ]);

    const body = await filteredResp.json();
    for (const artist of body.artists) {
      // Backend model serialises as activityScore (camelCase)
      expect((artist.activityScore as number) >= 8.5).toBeTruthy();
    }
  });

  test("1.4 total artist count appears in the page subtitle", async ({ page }) => {
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/artists") && !r.url().includes("/discussions") && r.status() === 200
      ),
      page.goto("/"),
    ]);
    const body = await resp.json();
    const total = body.total as number;
    expect(total).toBeGreaterThan(0);
    await expect(page.getByText(`${total} artists`)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. Artist Page — Profile & Discussions
// ---------------------------------------------------------------------------

test.describe("Artist Page — Profile & Discussions", () => {
  const ARTIST_ID = 1;

  test("2.1 artist profile renders name and genres", async ({ page }) => {
    const [artistResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/artists/${ARTIST_ID}`) &&
          !r.url().includes("discussions") &&
          r.status() === 200
      ),
      page.goto(`/artists/${ARTIST_ID}`),
    ]);

    const body = await artistResp.json();
    await expect(page.getByRole("heading", { name: body.artist.name as string })).toBeVisible();
    await expect(page.getByText((body.artist.genres as string[])[0]).first()).toBeVisible();
  });

  test("2.2 discussion list loads for the artist", async ({ page }) => {
    await page.goto(`/artists/${ARTIST_ID}`);
    const discResp = await page.waitForResponse(
      (r) => r.url().includes(`/api/artists/${ARTIST_ID}/discussions`) && r.status() === 200
    );

    const body = await discResp.json();
    expect(body.discussions.length).toBeGreaterThan(0);
    await expect(page.getByText(body.discussions[0].title as string).first()).toBeVisible();
  });

  test("2.3 clicking a discussion navigates to the thread and loads posts", async ({ page }) => {
    await page.goto(`/artists/${ARTIST_ID}`);
    await page.waitForResponse(
      (r) => r.url().includes(`/api/artists/${ARTIST_ID}/discussions`) && r.status() === 200
    );

    const [postsResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/discussions/") && r.url().includes("/posts") && r.status() === 200
      ),
      page.locator('a[href^="/discussions/"]').first().click(),
    ]);

    const body = await postsResp.json();
    expect(Array.isArray(body.posts)).toBe(true);
    expect(page.url()).toContain("/discussions/");
  });

  test("2.4 authenticated user can submit a post in a discussion thread", async ({ page }) => {
    // Register a separate account so it doesn't conflict with auth tests 3.x
    await gotoHome(page);
    await registerAccount(page, {
      email: POST_EMAIL,
      password: TEST_PASSWORD,
      display: POST_DISPLAY,
      handle: POST_HANDLE,
    });

    // Get a discussion ID from artist 1
    await page.goto(`/artists/${ARTIST_ID}`);
    const discResp = await page.waitForResponse(
      (r) => r.url().includes(`/api/artists/${ARTIST_ID}/discussions`) && r.status() === 200
    );
    const discBody = await discResp.json();
    const discussionId = (discBody.discussions as Array<{ id: number }>)[0].id;

    // Navigate to the discussion page
    await page.goto(`/discussions/${discussionId}`);
    await page.waitForResponse(
      (r) => r.url().includes(`/api/discussions/${discussionId}/posts`) && r.status() === 200
    );

    // CommentBox is visible only when logged in
    const textarea = page.locator("#comment-body");
    await expect(textarea).toBeVisible();
    await textarea.fill(`Integration test comment ${RUN_ID}`);

    const [postResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/discussions/") &&
          r.url().includes("/posts") &&
          r.request().method() === "POST" &&
          r.status() === 201
      ),
      page.getByRole("button", { name: /post/i }).last().click(),
    ]);

    const body = await postResp.json();
    expect(body.post.body).toBe(`Integration test comment ${RUN_ID}`);
    await expect(page.getByText(`Integration test comment ${RUN_ID}`)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Authentication
// ---------------------------------------------------------------------------

test.describe("Authentication", () => {
  test("3.1 register a new account", async ({ page }) => {
    await gotoHome(page);
    await registerAccount(page, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      display: TEST_DISPLAY,
      handle: TEST_HANDLE,
    });
    await expect(page.getByText(TEST_DISPLAY)).toBeVisible();
  });

  test("3.2 sign in with valid credentials", async ({ page }) => {
    await gotoHome(page);
    await signIn(page, TEST_EMAIL, TEST_PASSWORD);
    await expect(page.getByText(TEST_DISPLAY)).toBeVisible();
  });

  test("3.3 wrong password shows error message in the modal", async ({ page }) => {
    await gotoHome(page);
    await page.locator("header").getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator("#signin-email").fill(TEST_EMAIL);
    await page.locator("#signin-password").fill("wrongpassword");

    const [loginResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.status() === 401),
      page.locator('[role="dialog"] button[type="submit"]').click(),
    ]);

    expect(loginResp.status()).toBe(401);
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  test("3.4 session persists after navigating to a different page", async ({ page }) => {
    await gotoHome(page);
    await signIn(page, TEST_EMAIL, TEST_PASSWORD);
    await expect(page.getByText(TEST_DISPLAY)).toBeVisible();

    await page.goto("/best-albums");
    await page.waitForResponse((r) => r.url().includes("/api/albums") && r.status() === 200);
    // AuthContext calls /api/auth/me on mount — display name stays visible
    await expect(page.getByText(TEST_DISPLAY)).toBeVisible();
  });

  test("3.5 sign out reverts header to guest state", async ({ page }) => {
    await gotoHome(page);
    await signIn(page, TEST_EMAIL, TEST_PASSWORD);

    const [logoutResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/logout") && r.status() === 200),
      page.getByRole("button", { name: /sign out/i }).click(),
    ]);

    expect(logoutResp.status()).toBe(200);
    await expect(page.locator("header").getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: "Join", exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Best Albums Page
// ---------------------------------------------------------------------------

test.describe("Best Albums Page", () => {
  test("4.1 album cards render title from /api/albums", async ({ page }) => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/albums") && r.status() === 200),
      page.goto("/best-albums"),
    ]);
    const body = await resp.json();
    expect(body.albums.length).toBeGreaterThan(0);
    await expect(page.getByText(body.albums[0].title as string).first()).toBeVisible();
  });

  test("4.2 period button re-fetches with time_range param", async ({ page }) => {
    await page.goto("/best-albums");
    await page.waitForResponse((r) => r.url().includes("/api/albums") && r.status() === 200);

    // Time range buttons are plain <button> elements with labels "2026", "2025", "2024"
    const yearBtn = page.getByRole("button", { name: "2025", exact: true });
    if (!(await yearBtn.isVisible())) { test.skip(); return; }

    const [filteredResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("time_range=2025") && r.status() === 200),
      yearBtn.click(),
    ]);

    expect(filteredResp.url()).toContain("time_range=2025");
    const body = await filteredResp.json();
    for (const album of body.albums) {
      expect((album.releaseYear as number)).toBe(2025);
    }
  });

  test("4.3 genre button re-fetches with genre param", async ({ page }) => {
    await page.goto("/best-albums");
    await page.waitForResponse((r) => r.url().includes("/api/albums") && r.status() === 200);

    // Genre filter buttons follow the "Genre:" label span — first is "Rock"
    const rockBtn = page.getByRole("button", { name: "Rock", exact: true });
    if (!(await rockBtn.isVisible())) { test.skip(); return; }

    const [filteredResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("genre=Rock") && r.status() === 200),
      rockBtn.click(),
    ]);

    expect(filteredResp.url()).toContain("genre=Rock");
    const body = await filteredResp.json();
    for (const album of body.albums) {
      expect((album.genres as string[]).includes("Rock")).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. New Releases Page
// ---------------------------------------------------------------------------

test.describe("New Releases Page", () => {
  test("5.1 page fetches albums from /api/albums", async ({ page }) => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/albums") && r.status() === 200),
      page.goto("/new-releases"),
    ]);
    const body = await resp.json();
    expect(body).toHaveProperty("albums");
  });
});

// ---------------------------------------------------------------------------
// 6. Genres Page
// ---------------------------------------------------------------------------

test.describe("Genres Page", () => {
  test("6.1 genre grid loads from /api/albums/genres", async ({ page }) => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/albums/genres") && r.status() === 200),
      page.goto("/genres"),
    ]);
    const body = await resp.json();
    expect(body.genres.length).toBeGreaterThan(0);
    await expect(page.getByText(body.genres[0].name as string).first()).toBeVisible();
  });

  test("6.2 clicking a genre card fetches filtered albums via /api/albums?genre=", async ({ page }) => {
    await page.goto("/genres");
    const resp = await page.waitForResponse(
      (r) => r.url().includes("/api/albums/genres") && r.status() === 200
    );
    const body = await resp.json();
    const genreName = body.genres[0].name as string;

    // GenreCards are <button> elements; clicking one stays on /genres and loads albums
    const [albumsResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/albums") && r.url().includes("genre=") && r.status() === 200),
      page.getByRole("button", { name: genreName }).first().click(),
    ]);

    expect(albumsResp.url()).toContain("genre=");
    const albumsBody = await albumsResp.json();
    expect(albumsBody).toHaveProperty("albums");
  });
});

// ---------------------------------------------------------------------------
// 7. Community Page — Discussions
// ---------------------------------------------------------------------------

test.describe("Community Page — Discussions", () => {
  test("7.1 discussions load from /api/discussions; stats load from /api/stats", async ({ page }) => {
    const [discResp, statsResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/discussions") && !r.url().includes("/posts") && r.status() === 200
      ),
      page.waitForResponse((r) => r.url().includes("/api/stats") && r.status() === 200),
      page.goto("/community"),
    ]);

    const discBody = await discResp.json();
    const statsBody = await statsResp.json();

    expect(discBody.discussions.length).toBeGreaterThan(0);
    expect(statsBody.artistCount).toBeGreaterThan(0);

    // Use .first() because the same discussion title can appear in multiple sections
    await expect(page.getByText(discBody.discussions[0].title as string).first()).toBeVisible();
  });

  test("7.2 Popular sort re-fetches with sort=popular", async ({ page }) => {
    await page.goto("/community");
    await page.waitForResponse(
      (r) => r.url().includes("/api/discussions") && !r.url().includes("/posts") && r.status() === 200
    );

    const popularBtn = page.getByRole("button", { name: /popular/i });
    if (!(await popularBtn.isVisible())) { test.skip(); return; }

    const [filteredResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("sort=popular") && r.status() === 200),
      popularBtn.click(),
    ]);

    expect(filteredResp.url()).toContain("sort=popular");
  });
});

// ---------------------------------------------------------------------------
// 8. Lists Page
// ---------------------------------------------------------------------------

test.describe("Lists Page", () => {
  test("8.1 lists index loads from /api/lists", async ({ page }) => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().match(/\/api\/lists\b/) !== null && r.status() === 200),
      page.goto("/lists"),
    ]);
    const body = await resp.json();
    expect(body).toHaveProperty("lists");
  });

  test("8.2 opening a list loads its albums from /api/lists/<id>", async ({ page }) => {
    await page.goto("/lists");
    const listsResp = await page.waitForResponse(
      (r) => r.url().match(/\/api\/lists\b/) !== null && r.status() === 200
    );
    const listsBody = await listsResp.json();

    if ((listsBody.lists as unknown[]).length === 0) { test.skip(); return; }
    const firstListId = (listsBody.lists as Array<{ id: number }>)[0].id;

    const [detailResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/lists/${firstListId}`) && r.status() === 200),
      page.goto(`/lists/${firstListId}`),
    ]);

    const body = await detailResp.json();
    expect(body.list).toHaveProperty("albums");
  });

  test("8.3 authenticated user can create a list", async ({ page }) => {
    await gotoHome(page);
    await signIn(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto("/lists");
    await page.waitForResponse((r) => r.url().match(/\/api\/lists\b/) !== null && r.status() === 200);

    const createBtn = page.getByRole("button", { name: /create|new list/i }).first();
    if (!(await createBtn.isVisible())) { test.skip(); return; }
    await createBtn.click();

    await page.getByRole("textbox").first().fill(`Test List ${RUN_ID}`);

    const [createResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().match(/\/api\/lists\b/) !== null &&
          r.request().method() === "POST" &&
          r.status() === 201
      ),
      page.getByRole("button", { name: /create|save|submit/i }).last().click(),
    ]);

    const body = await createResp.json();
    expect(body.list.title).toBe(`Test List ${RUN_ID}`);
    await expect(page.getByText(`Test List ${RUN_ID}`)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 9. Search
// ---------------------------------------------------------------------------

test.describe("Search", () => {
  test("9.1 typing 2+ characters fires /api/search and returns results", async ({ page }) => {
    await gotoHome(page);

    const searchBox = page.getByRole("searchbox").first();
    const [searchResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/search") && r.status() === 200),
      searchBox.fill("ar"),
    ]);

    expect(searchResp.url()).toContain("/api/search");
    expect(searchResp.url()).toContain("q=ar");
  });

  test("9.2 single character does not trigger /api/search (debounce guard)", async ({ page }) => {
    await gotoHome(page);

    let searchFired = false;
    page.on("request", (req) => {
      if (req.url().includes("/api/search")) searchFired = true;
    });

    const searchBox = page.getByRole("searchbox").first();
    await searchBox.fill("a");
    // Wait longer than the 300ms debounce
    await page.waitForTimeout(500);
    expect(searchFired).toBe(false);
  });

  test("9.3 clicking an artist search result navigates to its artist page", async ({ page }) => {
    await gotoHome(page);

    const searchBox = page.getByRole("searchbox").first();
    await searchBox.fill("ar");
    const searchResp = await page.waitForResponse(
      (r) => r.url().includes("/api/search") && r.status() === 200
    );
    const body = await searchResp.json();

    if ((body.artists as unknown[]).length === 0) { test.skip(); return; }

    const artistName = body.artists[0].name as string;
    await expect(page.getByText(artistName).first()).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/artists\//),
      page.getByText(artistName).first().click(),
    ]);

    expect(page.url()).toContain("/artists/");
  });
});

// ---------------------------------------------------------------------------
// [DEPLOYED ONLY] — AWS Lambda + API Gateway end-to-end
// ---------------------------------------------------------------------------

test.describe("[DEPLOYED ONLY] AWS Lambda + API Gateway", () => {
  test.skip(!IS_DEPLOYED, "Skipped: not running against deployed environment");

  test("Lambda responds to GET /api/stats with valid JSON", async ({ request }) => {
    const baseUrl = process.env.BASE_URL ?? "";
    const resp = await request.get(`${baseUrl}/api/stats`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.artistCount).toBeGreaterThan(0);
  });

  test("API Gateway sets CORS headers for the Amplify origin", async ({ request }) => {
    const baseUrl = process.env.BASE_URL ?? "";
    const resp = await request.fetch(`${baseUrl}/api/stats`, {
      headers: { Origin: "https://main.d291kg32gzfrfc.amplifyapp.com" },
    });
    expect(resp.status()).toBe(200);
    const corsHeader = resp.headers()["access-control-allow-origin"];
    expect(corsHeader).toBeDefined();
  });

  test("Amplify-hosted frontend loads and fetches artists from API Gateway", async ({ page }) => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/artists") && r.status() === 200),
      page.goto("/"),
    ]);
    const body = await resp.json();
    expect(body.artists.length).toBeGreaterThan(0);
    await expect(page.getByText("Crescendo")).toBeVisible();
  });
});
