"""
QR Code Generator for Starknet Mini-Pay
Generate QR codes for addresses and payment links
"""

import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import SquareModuleDrawer, GlowingSquareModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask
from PIL import Image
from typing import Optional
import os


class QRGenerator:
    """Generate QR codes for Starknet addresses and payment links"""
    
    # Starknet brand colors
    COLORS = {
        "primary": (0, 0, 0),      # Black
        "white": (255, 255, 255),  # White
        "starknet": (0xFA, 0x53, 0x0C),  # Starknet orange
        "success": (0x00, 0xAA, 0x00),
        "error": (0xAA, 0x00, 0x00),
    }
    
    def __init__(self, box_size: int = 10, border: int = 2):
        """
        Initialize QR generator
        
        Args:
            box_size: Size of each QR module in pixels
            border: Border width in modules
        """
        self.box_size = box_size
        self.border = border
    
    def generate(
        self,
        address: str,
        amount: Optional[float] = None,
        memo: Optional[str] = None,
        output_file: str = "qr_code.png",
        color: tuple = None,
        logo_path: Optional[str] = None
    ):
        """
        Generate QR code for a Starknet address
        
        Args:
            address: Starknet address (0x...)
            amount: Optional amount to pre-fill
            memo: Optional memo/note
            output_file: Output file path
            color: RGB tuple for QR color
            logo_path: Optional logo to embed in center
        """
        # Build the data
        data = self._build_address_data(address, amount, memo)
        
        # Create QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,  # High error correction for logos
            box_size=self.box_size,
            border=self.border,
        )
        
        qr.add_data(data)
        qr.make(fit=True)
        
        # Generate image
        if color:
            fg_color = color
        else:
            fg_color = self.COLORS["starknet"]
        
        img = qr.make_image(
            image_factory=StyledPilImage,
            module_drawer=SquareModuleDrawer(),
            color_mask=SolidFillColorMask(front_color=fg_color),
        )
        
        # Add logo if provided
        if logo_path and os.path.exists(logo_path):
            img = self._add_logo(img, logo_path)
        
        # Add label
        img = self._add_label(img, address)
        
        # Save
        img.save(output_file)
        return output_file
    
    def generate_link(
        self,
        payment_link: str,
        output_file: str = "payment_qr.png",
        color: tuple = None
    ):
        """
        Generate QR code for a payment link
        
        Args:
            payment_link: Full payment link URL
            output_file: Output file path
            color: RGB tuple for QR color
        """
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=self.box_size,
            border=self.border,
        )
        
        qr.add_data(payment_link)
        qr.make(fit=True)
        
        if color:
            fg_color = color
        else:
            fg_color = self.COLORS["primary"]
        
        img = qr.make_image(
            image_factory=StyledPilImage,
            module_drawer=GlowingSquareModuleDrawer(),
            color_mask=SolidFillColorMask(front_color=fg_color),
        )
        
        img.save(output_file)
        return output_file
    
    def generate_batch(
        self,
        addresses: list,
        output_dir: str = "."
    ):
        """
        Generate QR codes for multiple addresses
        
        Args:
            addresses: List of (address, filename) tuples
            output_dir: Output directory
        """
        results = []
        for address, filename in addresses:
            output_path = os.path.join(output_dir, filename)
            self.generate(address, output_file=output_path)
            results.append(output_path)
        return results
    
    def _build_address_data(
        self,
        address: str,
        amount: Optional[float],
        memo: Optional[str]
    ) -> str:
        """Build data string for QR code"""
        # Ensure address is checksummed
        address = self._ensure_checksum(address)
        
        # Build data
        parts = [address]
        
        if amount:
            parts.append(f"amt={amount}")
        
        if memo:
            parts.append(f"memo={memo}")
        
        # Return as URI format
        if len(parts) > 1:
            return f"starknet:{address}?{'&'.join(parts[1:])}"
        return address
    
    def _ensure_checksum(self, address: str) -> str:
        """Ensure address has proper checksum (lowercase by default)"""
        if address.startswith("0x"):
            return address.lower()
        return address
    
    def _add_logo(self, qr_image, logo_path: str, logo_size: float = 0.25) -> Image.Image:
        """
        Add logo to center of QR code
        
        Args:
            qr_image: QR code PIL image
            logo_path: Path to logo file
            logo_size: Size ratio (0.25 = 25% of QR size)
        """
        logo = Image.open(logo_path)
        
        # Calculate logo size
        qr_width, qr_height = qr_image.size
        logo_max_size = int(min(qr_width, qr_height) * logo_size)
        
        # Resize logo maintaining aspect ratio
        logo.thumbnail((logo_max_size, logo_max_size), Image.Resampling.LANCZOS)
        
        # Calculate position (center)
        logo_width, logo_height = logo.size
        x = (qr_width - logo_width) // 2
        y = (qr_height - logo_height) // 2
        
        # Create white background for logo
        bg_width = int(logo_width * 1.2)
        bg_height = int(logo_height * 1.2)
        background = Image.new("RGBA", (bg_width, bg_height), (255, 255, 255, 255))
        bg_x = (qr_width - bg_width) // 2
        bg_y = (qr_height - bg_height) // 2
        
        # Paste logo with background
        qr_image = qr_image.convert("RGBA")
        qr_image.paste(background, (bg_x, bg_y), background)
        qr_image.paste(logo, (x, y), logo)
        
        return qr_image
    
    def _add_label(self, qr_image: Image.Image, address: str) -> Image.Image:
        """Add address label below QR code"""
        # Create combined image
        label_height = 50
        total_height = qr_image.size[1] + label_height
        
        combined = Image.new("RGB", (qr_image.size[0], total_height), (255, 255, 255))
        combined.paste(qr_image, (0, 0))
        
        # Add text
        from PIL import ImageDraw, ImageFont
        
        draw = ImageDraw.Draw(combined)
        
        # Shorten address for display
        short_addr = f"{address[:8]}...{address[-6:]}"
        
        try:
            font = ImageFont.truetype("arial.ttf", 20)
        except:
            font = ImageFont.load_default()
        
        # Draw text
        text_width = draw.textlength(short_addr, font=font)
        x = (combined.size[0] - text_width) // 2
        y = qr_image.size[1] + 12
        
        draw.text((x, y), short_addr, fill=(0, 0, 0), font=font)
        
        return combined
    
    def generate_svg(
        self,
        address: str,
        amount: Optional[float] = None,
        memo: Optional[str] = None,
        output_file: str = "qr_code.svg",
        color: tuple = None
    ):
        """
        Generate QR code as SVG (vector format)
        
        Args:
            address: Starknet address
            amount: Optional amount
            memo: Optional memo
            output_file: Output SVG file path
            color: RGB tuple for QR color
        """
        import qrcode.image.svg
        
        data = self._build_address_data(address, amount, memo)
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=self.box_size,
            border=self.border,
        )
        
        qr.add_data(data)
        qr.make(fit=True)
        
        if color:
            fg_color = color
        else:
            fg_color = self.COLORS["starknet"]
        
        # Convert RGB to hex
        fg_hex = "#{:02x}{:02x}{:02x}".format(*fg_color)
        
        img = qr.make_image(
            image_factory=qrcode.image.svg.SvgPathImage,
        )
        
        with open(output_file, "w") as f:
            f.write(img.to_string())
        
        return output_file


# Example usage
def example():
    qr = QRGenerator()
    
    # Simple address QR
    qr.generate(
        address="0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005",
        output_file="my_address_qr.png",
        amount=0.01,
        memo="Payment for services"
    )
    
    # Payment link QR
    payment_link = "starknet:0x053c91253bc9682c04929ca02ed00b3e423f6714d2ea42d73d1b8f3f8d400005?amount=0.01&memo=coffee"
    qr.generate_link(
        payment_link=payment_link,
        output_file="coffee_payment_qr.png"
    )


if __name__ == "__main__":
    example()
