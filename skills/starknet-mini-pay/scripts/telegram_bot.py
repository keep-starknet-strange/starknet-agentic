#!/usr/bin/env python3.12
"""
Starknet Mini-Pay Telegram Bot (Non-Custodial)
Send and receive payments via Telegram using deep links

IMPORTANT: This bot does NOT store private keys!
Users sign transactions in their own wallets (ArgentX/Braavos).

Flow:
1. Generate payment link/QR
2. User clicks → opens wallet
3. User signs in wallet → tx sent directly to Starknet
4. Webhook notifies bot → user notified

Commands:
    /start - Show welcome message
    /link [amount] [memo] - Generate payment link
    /qr - Show your QR code
    /invoice <amount> [memo] - Create payment request
    /status <tx_hash> - Check transaction status
    /webhook - Set webhook URL for notifications
    /help - Show help
"""

import os
import sys
import asyncio
import json
import hmac
import hashlib
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import (
    Application, CommandHandler, MessageHandler, 
    CallbackQueryHandler, ContextTypes, filters
)
from telegram.error import TelegramError
from aiohttp import web
import logging

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from qr_generator import QRGenerator
from link_builder import PaymentLinkBuilder
from invoice import InvoiceManager
from mini_pay import MiniPay


# Configuration
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
STARKNET_RPC = os.environ.get("STARKNET_RPC", "https://rpc.starknet.lava.build:443")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "your_secret_here")
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "")  # For receiving tx confirmations

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class StarknetMiniPayBot:
    """Non-custodial Telegram bot for Starknet Mini-Pay"""
    
    # Wallet deep link formats
    WALLET_DEEP_LINKS = {
        "argent": "argent://starknet/pay",
        "braavos": "braavos://starknet/pay",
        "generic": "starknet://"
    }
    
    def __init__(self, token: str):
        self.token = token
        self.qr = QRGenerator()
        self.link_builder = PaymentLinkBuilder()
        self.pay = MiniPay(rpc_url=STARKNET_RPC)
        self.invoice_db = None  # Initialized in start()
        
        # Webhook state
        self.webhook_url = WEBHOOK_URL
        self.webhook_secret = WEBHOOK_SECRET
        
        # Application
        self.app = Application.builder().token(token).build()
        
        # Register handlers
        self._register_handlers()
    
    def _register_handlers(self):
        """Register command and message handlers"""
        
        # Commands
        self.app.add_handler(CommandHandler("start", self.cmd_start))
        self.app.add_handler(CommandHandler("help", self.cmd_help))
        self.app.add_handler(CommandHandler("link", self.cmd_link))
        self.app.add_handler(CommandHandler("qr", self.cmd_qr))
        self.app.add_handler(CommandHandler("invoice", self.cmd_invoice))
        self.app.add_handler(CommandHandler("status", self.cmd_status))
        self.app.add_handler(CommandHandler("webhook", self.cmd_webhook))
        self.app.add_handler(CommandHandler("myaddress", self.cmd_myaddress))
        
        # Callbacks
        self.app.add_handler(CallbackQueryHandler(self.callback_handler))
        
        # Fallback - handle text
        self.app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_text))
    
    async def cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command"""
        user = update.message.from_user
        
        welcome = f"""
🪙 <b>Starknet Mini-Pay</b>

Non-custodial P2P payments on Starknet.

🔒 <b>Your keys, your coins.</b>
💰 <b>No middleman.</b>
⚡ <b>Instant payments.</b>

<b>How it works:</b>
1. Create a payment link/QR
2. User clicks → opens their wallet
3. User signs in their wallet (ArgentX/Braavos)
4. Transaction goes directly to Starknet

<b>Commands:</b>
/link [amount] [memo] - Create payment link
/qr - Get your QR code
/invoice <amount> [memo] - Create invoice
/status <tx_hash> - Check transaction
/myaddress - Set your Starknet address
/help - Get help
"""
        
        keyboard = [
            [InlineKeyboardButton("💸 Create Link", callback_data="link")],
            [InlineKeyboardButton("📱 Get QR Code", callback_data="qr")],
            [InlineKeyboardButton("📄 Create Invoice", callback_data="invoice")],
        ]
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_html(welcome, reply_markup=reply_markup)
    
    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /help command"""
        help_text = """
🪙 <b>Starknet Mini-Pay Help</b>

🔒 <b>Non-Custodial:</b> This bot never touches your keys.
   Transactions are signed in YOUR wallet.

<b>Available Commands:</b>

💰 <b>Create Payment</b>
/link [amount] [memo]
  Example: /link 0.05 coffee
  Generates a link to share

/qr - Get a QR code for your address

/invoice <amount> [memo]
  Example: /invoice 25 consulting
  Creates a payment request with expiry

📱 <b>Wallets Supported</b>
• Argent X
• Braavos
• Any Starknet wallet

🔗 <b>Deep Links</b>
Links open directly in your wallet app.
No need to copy-paste addresses!

📊 <b>Info</b>
/status <tx_hash> - Check transaction status
/myaddress <address> - Set your default address

<b>Payment Link Format:</b>
starknet:<address>?amount=<value>&memo=<text>
"""
        
        await update.message.reply_html(help_text)
    
    async def cmd_link(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /link command - create payment link"""
        user_id = str(update.message.from_user.id)
        args = context.args
        
        # Parse arguments
        amount = float(args[0]) if args and self._is_number(args[0]) else None
        memo = " ".join(args[1:]) if len(args) > 1 else "Payment"
        
        # Get user's address
        address = self._get_user_address(user_id)
        
        if not address:
            await update.message.reply_text(
                "❌ No address set. Use /myaddress <address> first."
            )
            return
        
        try:
            # Create payment link
            link = self.link_builder.create(
                address=address,
                amount=amount,
                memo=memo
            )
            
            # Create deep link version
            deep_link = self._create_deep_link(address, amount, memo)
            
            # Generate QR
            qr_file = f"link_{user_id}.png"
            self.qr.generate_link(link, qr_file)
            
            # Build wallet buttons
            keyboard = [
                [InlineKeyboardButton("🦊 Open in ArgentX", url=deep_link.get("argent", link))],
                [InlineKeyboardButton("🦁 Open in Braavos", url=deep_link.get("braavos", link))],
                [InlineKeyboardButton("🔗 Copy Link", callback_data=f"copy_link:{link}")],
            ]
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            # Send QR with link info
            with open(qr_file, "rb") as photo:
                await update.message.reply_photo(
                    photo=photo,
                    caption=f"📱 <b>Payment Link</b>\n\n"
                            f"<code>{link}</code>\n\n"
                            f"{'Amount: ' + str(amount) + ' ETH' if amount else 'Amount: Not specified'}\n"
                            f"Memo: {memo}",
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            
            # Clean up
            os.remove(qr_file)
            
        except Exception as e:
            logger.error(f"Error creating link: {e}")
            await update.message.reply_text(f"❌ Error: {e}")
    
    async def cmd_qr(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /qr command - generate QR for address"""
        user_id = str(update.message.from_user.id)
        address = self._get_user_address(user_id)
        
        if not address:
            await update.message.reply_text(
                "❌ No address set. Use /myaddress <address> first."
            )
            return
        
        try:
            # Generate QR
            qr_file = f"qr_{user_id}.png"
            self.qr.generate(
                address=address,
                output_file=qr_file
            )
            
            # Create receive link
            link = self.link_builder.create(address=address)
            
            # Send
            with open(qr_file, "rb") as photo:
                await update.message.reply_photo(
                    photo=photo,
                    caption=f"📱 <b>Your Receive QR</b>\n\n"
                            f"<code>{address}</code>\n\n"
                            f"Share this QR to receive payments!\n"
                            f"Link: {link}",
                    parse_mode="HTML"
                )
            
            os.remove(qr_file)
            
        except Exception as e:
            logger.error(f"Error generating QR: {e}")
            await update.message.reply_text(f"❌ Error: {e}")
    
    async def cmd_invoice(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /invoice command - create payment request"""
        args = context.args
        
        if len(args) < 1:
            await update.message.reply_text(
                "❌ Usage: /invoice <amount> [memo]\n"
                "Example: /invoice 25 consulting"
            )
            return
        
        try:
            amount = float(args[0])
        except ValueError:
            await update.message.reply_text("❌ Invalid amount")
            return
        
        memo = " ".join(args[1:]) if len(args) > 1 else "Payment"
        user_id = str(update.message.from_user.id)
        address = self._get_user_address(user_id)
        
        if not address:
            await update.message.reply_text(
                "❌ No address set. Use /myaddress <address> first."
            )
            return
        
        try:
            # Create invoice
            async with InvoiceManager() as inv_manager:
                invoice = await inv_manager.create(
                    payer_address=address,
                    amount=amount,
                    token="USDC",
                    description=memo
                )
                
                payment_url = inv_manager.create_payment_url(invoice)
                expires_in = inv_manager.format_expiry(invoice)
                
                # Create deep link
                deep_link = self._create_deep_link(address, amount, f"Invoice #{invoice.id[:8]} - {memo}")
                
                # Generate QR
                qr_file = f"invoice_{user_id}.png"
                self.qr.generate_link(payment_url, qr_file)
                
                keyboard = [
                    [InlineKeyboardButton("🦊 Pay with ArgentX", url=deep_link.get("argent", payment_url))],
                    [InlineKeyboardButton("🦁 Pay with Braavos", url=deep_link.get("braavos", payment_url))],
                    [InlineKeyboardButton("🔗 Copy Link", callback_data=f"copy_link:{payment_url}")],
                ]
                
                reply_markup = InlineKeyboardMarkup(keyboard)
                
                with open(qr_file, "rb") as photo:
                    await update.message.reply_photo(
                        photo=photo,
                        caption=f"📄 <b>Invoice Created</b>\n\n"
                                f"ID: <code>{invoice.id}</code>\n"
                                f"Amount: {amount} USDC\n"
                                f"Memo: {memo}\n"
                                f"Expires: {expires_in}\n\n"
                                f"<code>{payment_url}</code>",
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
                
                os.remove(qr_file)
                
        except Exception as e:
            logger.error(f"Error creating invoice: {e}")
            await update.message.reply_text(f"❌ Error: {e}")
    
    async def cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /status command - check transaction"""
        if not context.args:
            await update.message.reply_text("❌ Usage: /status <tx_hash>")
            return
        
        tx_hash = context.args[0]
        
        try:
            status = await self.pay.get_transaction_status(tx_hash)
            tx_data = await self.pay.get_transaction(tx_hash)
            
            status_emoji = {
                "CONFIRMED": "✅",
                "PENDING": "⏳",
                "REJECTED": "❌",
                "FAILED": "🚫",
                "NOT_FOUND": "🔍"
            }.get(status, "❓")
            
            response = f"""
📊 <b>Transaction Status</b>

TX: <code>{tx_hash}</code>

<b>Status:</b> {status_emoji} {status}

<b>Block:</b> {tx_data.get('block_number', 'Pending')}
<b>From:</b> <code>{str(tx_data.get('sender_address', ''))[:20]}...</code>
"""
            
            await update.message.reply_html(response)
            
        except Exception as e:
            logger.error(f"Error checking status: {e}")
            await update.message.reply_text(f"❌ Error: {e}")
    
    async def cmd_webhook(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /webhook command - set webhook URL"""
        if not context.args:
            await update.message.reply_text(
                "❌ Usage: /webhook <url>\n\n"
                "Set a webhook URL to receive transaction confirmations.\n"
                "We'll POST to this URL when payments are received."
            )
            return
        
        webhook_url = context.args[0]
        
        # Validate URL
        if not webhook_url.startswith("http"):
            await update.message.reply_text("❌ URL must start with http:// or https://")
            return
        
        # Store for this chat
        chat_id = str(update.message.chat_id)
        
        # In production, store in database
        webhook_config = {
            "url": webhook_url,
            "chat_id": chat_id,
            "set_at": datetime.now().isoformat()
        }
        
        # TODO: Store in database
        
        await update.message.reply_text(
            f"✅ <b>Webhook Set</b>\n\n"
            f"URL: {webhook_url}\n\n"
            f"POST format:\n"
            f"<pre>{json.dumps({'tx_hash': '0x...', 'status': 'CONFIRMED', 'amount': '0.05'})}</pre>",
            parse_mode="HTML"
        )
    
    async def cmd_myaddress(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /myaddress command - set user's address"""
        if not context.args:
            await update.message.reply_text(
                "❌ Usage: /myaddress <address>\n\n"
                "Set your default Starknet address for payments."
            )
            return
        
        address = context.args[0]
        
        # Validate address format
        if not self._validate_address(address):
            await update.message.reply_text("❌ Invalid Starknet address")
            return
        
        # Store (in production, use database)
        user_id = str(update.message.from_user.id)
        self._set_user_address(user_id, address)
        
        await update.message.reply_text(
            f"✅ <b>Address Set</b>\n\n"
            f"<code>{address}</code>\n\n"
            f"Use /qr to get your receive QR!",
            parse_mode="HTML"
        )
    
    async def callback_handler(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle inline button callbacks"""
        query = update.callback_query
        await query.answer()
        
        data = query.data
        
        if data == "link":
            await query.edit_message_text(
                "💸 <b>Create Payment Link</b>\n\n"
                "Usage: /link [amount] [memo]\n\n"
                "Example:\n"
                "/link 0.05 coffee\n"
                "/link 25 services\n\n"
                "Creates a shareable link that opens in the user's wallet.",
                parse_mode="HTML"
            )
        elif data == "qr":
            await query.edit_message_text(
                "📱 <b>Get Your QR Code</b>\n\n"
                "Use /myaddress to set your address first, then /qr to generate.\n\n"
                "Share the QR to receive payments!",
                parse_mode="HTML"
            )
        elif data == "invoice":
            await query.edit_message_text(
                "📄 <b>Create Invoice</b>\n\n"
                "Usage: /invoice <amount> [memo]\n\n"
                "Example:\n"
                "/invoice 25 consulting\n"
                "/invoice 0.1 subscription\n\n"
                "Creates a payment request with expiry time.",
                parse_mode="HTML"
            )
        elif data.startswith("copy_link:"):
            link = data.split(":", 1)[1]
            await query.edit_message_caption(
                caption=f"🔗 <b>Payment Link</b>\n\n<code>{link}</code>",
                parse_mode="HTML"
            )
    
    async def handle_text(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle text messages"""
        text = update.message.text.strip()
        
        # Detect payment link
        if text.startswith("starknet:") or "starknet:0x" in text:
            try:
                # Parse link
                if "?" in text:
                    url = text
                else:
                    url = f"starknet:{text}"
                
                data = self.link_builder.parse(url)
                
                # Create deep link
                deep_link = self._create_deep_link(
                    data.address, 
                    data.amount, 
                    data.memo
                )
                
                keyboard = [
                    [InlineKeyboardButton("🦊 Pay with ArgentX", url=deep_link.get("argent", url))],
                    [InlineKeyboardButton("🦁 Pay with Braavos", url=deep_link.get("braavos", url))],
                ]
                
                reply_markup = InlineKeyboardMarkup(keyboard)
                
                await update.message.reply_text(
                    f"📱 <b>Payment Link Detected</b>\n\n"
                    f"Address: <code>{data.address[:20]}...</code>\n"
                    f"Amount: {data.amount or 'Not specified'} {data.token}\n"
                    f"Memo: {data.memo or 'None'}\n\n"
                    f"Click a wallet to pay:",
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
                
            except Exception as e:
                await update.message.reply_text(f"❌ Invalid link: {e}")
    
    def _create_deep_link(
        self, 
        address: str, 
        amount: float = None, 
        memo: str = None
    ) -> dict:
        """Create wallet deep links"""
        
        # Build payment URL
        params = [f"address={address}"]
        if amount:
            params.append(f"amount={amount}")
        if memo:
            params.append(f"memo={memo}")
        
        payment_url = f"?{ '&'.join(params)}"
        
        return {
            "argent": f"argent://starknet/pay{payment_url}",
            "braavos": f"braavos://starknet/pay{payment_url}",
            "generic": f"starknet:{address}?{'&'.join(params[1:])}" if params[1:] else f"starknet:{address}"
        }
    
    def _validate_address(self, address: str) -> bool:
        """Validate Starknet address format"""
        if not address.startswith("0x"):
            address = f"0x{address}"
        
        if len(address) != 66:
            return False
        
        return all(c in "0123456789abcdef" for c in address[2:])
    
    def _is_number(self, s: str) -> bool:
        """Check if string is a number"""
        try:
            float(s)
            return True
        except ValueError:
            return False
    
    def _get_user_address(self, user_id: str) -> str:
        """Get user's stored address (from memory/db)"""
        # In production, read from database
        return user_addresses.get(user_id, "")
    
    def _set_user_address(self, user_id: str, address: str):
        """Store user's address"""
        user_addresses[user_id] = address.lower()
    
    async def start(self):
        """Start the bot and webhook server"""
        # Initialize invoice database
        async with InvoiceManager() as inv:
            pass  # Database initialized
        
        logger.info("Starting Starknet Mini-Pay Bot...")
        await self.app.initialize()
        await self.app.start()
        
        # Start webhook server if URL configured
        if self.webhook_url:
            await self._start_webhook_server()
        
        # Start polling
        await self.app.updater.start_polling()
        
        logger.info("Bot started!")
        
        # Keep running
        while True:
            await asyncio.sleep(3600)
    
    async def _start_webhook_server(self):
        """Start webhook server for transaction notifications"""
        app = web.Application()
        
        # Webhook endpoint
        app.router.add_post("/webhook", self.handle_webhook)
        
        # Health check
        app.router.add_get("/health", self.handle_health)
        
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", 8080)
        await site.start()
        
        logger.info(f"Webhook server running on port 8080")
    
    async def handle_webhook(self, request: web.Request):
        """Handle incoming webhook from payment system"""
        try:
            data = await request.json()
            
            tx_hash = data.get("tx_hash")
            status = data.get("status")
            amount = data.get("amount")
            
            logger.info(f"Webhook received: {tx_hash} - {status}")
            
            # Get chat_id from database and notify
            # TODO: Implement chat lookup
            
            return web.json_response({"status": "ok"})
            
        except Exception as e:
            logger.error(f"Webhook error: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def handle_health(self, request: web.Request):
        """Health check endpoint"""
        return web.json_response({"status": "healthy"})
    
    def run(self):
        """Run the bot (blocking)"""
        asyncio.run(self.start())


# In-memory user storage (use database in production)
user_addresses = {}


# Main entry point
def main():
    """Main entry point"""
    token = TELEGRAM_BOT_TOKEN
    
    if not token:
        print("❌ Error: TELEGRAM_BOT_TOKEN not set")
        print("Set it with: export TELEGRAM_BOT_TOKEN=your_token")
        return
    
    print("🤖 Starting Starknet Mini-Pay Bot (Non-Custodial)")
    print("🔒 Keys never touch the bot - users sign in their wallets!")
    
    bot = StarknetMiniPayBot(token)
    bot.run()


if __name__ == "__main__":
    main()
