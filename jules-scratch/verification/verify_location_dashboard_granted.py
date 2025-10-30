from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    context.grant_permissions(['geolocation'], origin="http://localhost:5173")
    context.set_geolocation({'latitude': 20.5937, 'longitude': 78.9629})
    page = context.new_page()

    page.goto("http://localhost:5173")
    page.get_by_role("combobox").select_option(label="Admin")
    page.get_by_placeholder("Password").fill("password")
    login_button = page.get_by_role("button", name="Login")
    expect(login_button).to_be_enabled()
    login_button.click()

    page.get_by_role("button", name="Management").click()
    page.get_by_role("button", name="📍 Locations").click()

    page.wait_for_selector(".leaflet-container")
    page.screenshot(path="jules-scratch/verification/location_dashboard.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
