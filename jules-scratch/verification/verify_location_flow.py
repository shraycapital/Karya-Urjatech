from playwright.sync_api import sync_playwright, expect

def run(playwright):
    # Test Case 1: Permission Denied
    browser = playwright.chromium.launch(headless=True)
    context_denied = browser.new_context()
    context_denied.grant_permissions([], origin="http://localhost:5173") # Deny all permissions
    page_denied = context_denied.new_page()

    page_denied.goto("http://localhost:5173")
    page_denied.get_by_role("combobox").select_option(label="Admin")
    page_denied.get_by_placeholder("Password").fill("password")
    page_denied.get_by_role("button", name="Login").click()

    expect(page_denied.get_by_text("Location Access Required")).to_be_visible()
    page_denied.screenshot(path="jules-scratch/verification/permission_denied.png")
    context_denied.close()

    # Test Case 2: Permission Granted
    context_granted = browser.new_context()
    context_granted.grant_permissions(['geolocation'], origin="http://localhost:5173")
    context_granted.set_geolocation({'latitude': 20.5937, 'longitude': 78.9629})
    page_granted = context_granted.new_page()

    page_granted.goto("http://localhost:5173")
    page_granted.get_by_role("combobox").select_option(label="Admin")
    page_granted.get_by_placeholder("Password").fill("password")
    login_button = page_granted.get_by_role("button", name="Login")
    expect(login_button).to_be_enabled()
    login_button.click()

    page_granted.get_by_role("button", name="Management").click()
    page_granted.get_by_role("button", name="📍 Locations").click()

    page_granted.wait_for_selector(".leaflet-container")
    page_granted.screenshot(path="jules-scratch/verification/location_dashboard.png")
    context_granted.close()

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
