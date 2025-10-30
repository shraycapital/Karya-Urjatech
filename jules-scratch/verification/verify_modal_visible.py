from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    page.goto("http://localhost:5173")
    expect(page.get_by_text("Location Access Required")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/permission_denied.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
