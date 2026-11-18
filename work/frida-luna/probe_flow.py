"""Sonda o Chrome ligado por CDP: que abas existem e se a caixa de prompt do Flow aparece."""
import asyncio

from playwright.async_api import async_playwright

EDITOR = 'div.ProseMirror[contenteditable="true"]'


async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://127.0.0.1:18800")
        for ctx in b.contexts:
            for i, pg in enumerate(ctx.pages):
                try:
                    title = await pg.title()
                except Exception:
                    title = "(erro)"
                n = await pg.locator(EDITOR).count()
                print(f"{i} | editor={n} | {pg.url[:90]}")
                print(f"    titulo: {title[:60]}")


asyncio.run(main())
