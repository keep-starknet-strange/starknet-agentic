#!/usr/bin/env python3
"""
Telegram Bot for Starknet Mini-Pay
"""

import asyncio

class MiniPayBot:
    def __init__(self, token: str):
        self.token = token

    async def start(self):
        print("Bot ready")

if __name__ == "__main__":
    import os
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if token:
        bot = MiniPayBot(token)
        asyncio.run(bot.start())
    else:
        print("Set TELEGRAM_BOT_TOKEN")
