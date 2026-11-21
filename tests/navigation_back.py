"""Run with python3 tests/navigation_back.py against the local preview."""
import asyncio
import os
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

BASE = os.environ.get("APP_TEST_URL", "http://localhost:8080")


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        host = await browser.new_page()
        guest = await browser.new_page()
        await host.goto(BASE + "/party/204080")
        await host.get_by_role("link", name="Back", exact=True).click()
        await host.get_by_role("link", name="Jump in as a guest").click()
        assert parse_qs(urlparse(host.url).query) == {"guest": ["true"]}
        await host.go_back()
        assert urlparse(host.url).path == "/"
        assert not urlparse(host.url).query

        await host.get_by_role("link", name="Log in or sign up").click()
        await host.get_by_role("link", name="Sign up", exact=True).click()
        assert parse_qs(urlparse(host.url).query) == {"tab": ["signup"]}
        await host.get_by_role("link", name="Forgot password?").click()
        assert parse_qs(urlparse(host.url).query) == {"tab": ["forgot"]}
        await host.go_back()
        assert parse_qs(urlparse(host.url).query) == {"tab": ["signup"]}
        await host.reload()
        await host.get_by_label("Username (display name)").wait_for()
        await host.go_back()
        assert urlparse(host.url).path == "/auth"
        assert not urlparse(host.url).query
        await host.goto(BASE + "/reset-password")
        await host.get_by_role("link", name="Back", exact=True).click()
        assert urlparse(host.url).path == "/auth"

        await host.goto(BASE + "/?guest=true")
        await host.get_by_label("Display name").fill("Navigation host")
        await host.get_by_role("button", name="Create a new group").click()
        await host.get_by_role("button", name="Copy code", exact=True).wait_for()
        party_path = urlparse(host.url).path
        code = party_path.rsplit("/", 1)[-1]
        await guest.goto(BASE + "/?guest=true")
        await guest.get_by_label("Display name").fill("Navigation guest")
        await guest.get_by_label("Party code").fill(code)
        await guest.get_by_role("button", name="Join party", exact=True).click()
        await guest.get_by_role("button", name="Copy code", exact=True).wait_for()
        await host.get_by_role("button", name="Start the journey").click()
        await host.wait_for_url("**" + party_path + "/map")
        await guest.wait_for_url("**" + party_path + "/map")
        await guest.go_back()
        assert urlparse(guest.url).path == "/"
        assert parse_qs(urlparse(guest.url).query) == {"guest": ["true"]}
        await host.get_by_role("button", name="Team status", exact=True).click()
        await host.wait_for_url("**" + party_path)
        await guest.goto(BASE + party_path)
        await guest.get_by_role("button", name="Copy code", exact=True).wait_for()
        assert await guest.get_by_text("Navigation guest (you)", exact=True).count() == 1
        await guest.get_by_role("link", name="Back", exact=True).click()
        await guest.get_by_role("link", name="Jump in as a guest").click()
        await guest.get_by_role("link", name="← Back", exact=True).click()
        assert urlparse(guest.url).path == "/"
        assert not urlparse(guest.url).query
        await host.go_back()
        assert urlparse(host.url).path == "/"
        print("Guest, auth, recovery, synchronized journey, and membership-preserving Back checks passed.")
        await browser.close()


asyncio.run(main())