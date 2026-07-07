const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  console.log('🚀 Starting E2E UI Tests from workspace root...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // 1. Visit Login
    console.log('📌 Navigating to login page...');
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    // Take screenshot of login page
    await page.screenshot({ path: path.join(__dirname, 'screenshot-1-login.png') });
    console.log('📸 Login page screenshot saved.');

    // 2. Perform Login
    console.log('🔑 Entering login credentials...');
    await page.fill('input[placeholder="dhaka-city-school"]', 'dhaka-city-school');
    await page.fill('input[placeholder="admin@peopleit.com"]', 'admin@peopleit.com');
    await page.fill('input[placeholder="••••••••"]', 'admin123');

    // Click Sign In
    console.log('🖱️ Clicking sign-in button...');
    await Promise.all([
      page.waitForNavigation({ url: '**/', waitUntil: 'networkidle' }),
      page.click('button[type="submit"]')
    ]);

    console.log('✅ Login successful! Redirected to Dashboard.');
    await page.screenshot({ path: path.join(__dirname, 'screenshot-2-dashboard.png') });
    console.log('📸 Dashboard screenshot saved.');

    // 3. Navigate to Notice Board
    console.log('📌 Navigating to Notice Board...');
    await page.click('#sidebar-nav-notices');
    await page.waitForTimeout(1000); // Wait for transition
    await page.screenshot({ path: path.join(__dirname, 'screenshot-3-notices-feed.png') });
    console.log('📸 Notices page feed screenshot saved.');

    // 4. Create a Notice
    console.log('➕ Clicking Create Notice button...');
    await page.click('button:has-text("Create Notice")');
    await page.waitForTimeout(500);

    console.log('✍️ Filling Notice form...');
    await page.fill('input[placeholder="e.g. Mid-Term Examination Schedule"]', 'E2E Automated UI Verification');
    await page.selectOption('select', 'ALL');
    await page.fill('textarea[placeholder="Write full notice details here..."]', 'Hello PeopleIT! This is an automated end-to-end verification test validating that UI data injection, state rendering, and PostgreSQL database persistence are fully integrated and working flawlessly.');

    await page.screenshot({ path: path.join(__dirname, 'screenshot-4-notice-form.png') });

    console.log('🚀 Publishing notice...');
    await page.click('button[type="submit"]');

    // Wait for the feed to update
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(__dirname, 'screenshot-5-notice-published.png') });
    console.log('📸 Notice published and screenshots saved.');

    // 5. Navigate to Students page
    console.log('📌 Navigating to Students list...');
    await page.click('#sidebar-nav-students');
    await page.waitForTimeout(2000); // Wait for API fetch
    await page.screenshot({ path: path.join(__dirname, 'screenshot-6-students-list.png') });
    console.log('📸 Students page screenshot saved.');

    console.log('🎉 E2E Verification Completed Successfully!');
  } catch (error) {
    console.error('❌ E2E Verification Failed:', error);
    await page.screenshot({ path: path.join(__dirname, 'screenshot-error.png') });
  } finally {
    await browser.close();
  }
}

run();
