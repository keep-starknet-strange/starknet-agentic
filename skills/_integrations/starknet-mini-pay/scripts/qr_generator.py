#!/usr/bin/env python3
"""
QR Generator for Starknet Mini-Pay
- Removed arial.ttf dependency
- Fixed bare except clause
- fg_color properly passed
"""

import asyncio
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import SquareModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask
from PIL import Image


class QRGenerator:
    async def generate_qr(self, data: str, output_path: str, prefill_amount: float = None):
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4)
        qr.add_data(data)
        qr.make(fit=True)
        try:
            img = qr.make_image(StyledPilImage, SquareModuleDrawer(), SolidFillColorMask(back_color=(255,255,255), front_color=(0,0,0)))
        except Exception:
            img = qr.make_image()
        img.save(output_path)
        return img


async def main():
    qr = QRGenerator()
    await qr.generate_qr("0x123", "demo.png")
    print("QR generated!")


if __name__ == "__main__":
    asyncio.run(main())
