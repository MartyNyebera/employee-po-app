#!/usr/bin/env python3
"""
Kimoel Driver App QR Code Generator
Generates QR codes for easy app installation
"""

import qrcode
import qrcode.image.svg
import qrcode.constants
from urllib.parse import quote
import argparse
import os

class QRCodeGenerator:
    def __init__(self):
        self.base_url = "https://employee-po-system.onrender.com"
        self.android_apk_url = "https://employee-po-system.onrender.com/tracker.html"
        self.ios_appstore_url = "https://employee-po-system.onrender.com/tracker.html"
        
    def generate_installation_qr(self, output_dir="qr-codes"):
        """Generate QR code for installation page"""
        os.makedirs(output_dir, exist_ok=True)
        
        # Create installation page URL
        install_url = f"{self.base_url}/tracker.html"
        
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        
        qr.add_data(install_url)
        qr.make(fit=True)
        
        # Save as PNG
        img = qr.make_image(fill_color="black", back_color="white")
        png_path = os.path.join(output_dir, "install-qr.png")
        img.save(png_path)
        
        # Save as SVG for better quality
        factory = qrcode.image.svg.SvgImage
        svg_path = os.path.join(output_dir, "install-qr.svg")
        qr.make_image(fill_color="black", back_color="white", image_factory=factory).save(svg_path)
        
        print(f"✅ Installation QR codes generated:")
        print(f"   📱 PNG: {png_path}")
        print(f"   🎨 SVG: {svg_path}")
        print(f"   🔗 URL: {install_url}")
        
        return png_path, svg_path, install_url
    
    def generate_platform_qrs(self, output_dir="qr-codes"):
        """Generate separate QR codes for Android and iOS"""
        os.makedirs(output_dir, exist_ok=True)
        
        qr_codes = {}
        
        # Android QR
        android_qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        android_qr.add_data(self.android_apk_url)
        android_qr.make(fit=True)
        
        android_img = android_qr.make_image(fill_color="black", back_color="white")
        android_path = os.path.join(output_dir, "android-qr.png")
        android_img.save(android_path)
        qr_codes['android'] = android_path
        
        # iOS QR
        ios_qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        ios_qr.add_data(self.ios_appstore_url)
        ios_qr.make(fit=True)
        
        ios_img = ios_qr.make_image(fill_color="black", back_color="white")
        ios_path = os.path.join(output_dir, "ios-qr.png")
        ios_img.save(ios_path)
        qr_codes['ios'] = ios_path
        
        print(f"✅ Platform QR codes generated:")
        print(f"   🤖 Android: {android_path}")
        print(f"   🍎 iOS: {ios_path}")
        
        return qr_codes
    
    def generate_driver_onboarding_qr(self, driver_id, output_dir="qr-codes"):
        """Generate personalized QR code for specific driver"""
        os.makedirs(output_dir, exist_ok=True)
        
        # Create personalized URL
        driver_url = f"{self.base_url}/install?driver={driver_id}"
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        
        qr.add_data(driver_url)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        driver_path = os.path.join(output_dir, f"driver-{driver_id}-qr.png")
        img.save(driver_path)
        
        print(f"✅ Driver QR code generated:")
        print(f"   👤 Driver {driver_id}: {driver_path}")
        print(f"   🔗 URL: {driver_url}")
        
        return driver_path, driver_url
    
    def create_printable_qr_sheet(self, output_dir="qr-codes"):
        """Create a printable PDF with QR codes and instructions"""
        try:
            from reportlab.lib.pagesizes import letter, A4
            from reportlab.pdfgen import canvas
            from reportlab.lib.units import inch
            from reportlab.lib.colors import HexColor
            
            os.makedirs(output_dir, exist_ok=True)
            
            # Create PDF
            c = canvas.Canvas(os.path.join(output_dir, "qr-install-sheet.pdf"), pagesize=A4)
            width, height = A4
            
            # Title
            c.setFont("Helvetica-Bold", 24)
            c.drawCentredString(width/2, height - 2*inch, "Kimoel Driver App Installation")
            
            # Subtitle
            c.setFont("Helvetica", 16)
            c.drawCentredString(width/2, height - 2.5*inch, "Scan QR Code to Install")
            
            # Main QR Code (placeholder - you'll add the actual image)
            c.rect(width/2 - 1.5*inch, height - 6*inch, 3*inch, 3*inch)
            c.setFont("Helvetica", 12)
            c.drawCentredString(width/2, height - 6.5*inch, "QR Code Here")
            
            # Instructions
            instructions = [
                "How to Install:",
                "1. Open your phone camera",
                "2. Scan this QR code",
                "3. Tap the download link",
                "4. Install the Kimoel Driver App",
                "5. Login with your driver credentials"
            ]
            
            y_position = height - 7*inch
            c.setFont("Helvetica", 12)
            for instruction in instructions:
                c.drawString(2*inch, y_position, instruction)
                y_position -= 0.4*inch
            
            # Platform specific
            c.setFont("Helvetica-Bold", 14)
            c.drawString(2*inch, y_position - 0.5*inch, "Platform Support:")
            c.setFont("Helvetica", 12)
            c.drawString(2*inch, y_position - 0.9*inch, "• Android: Direct APK download")
            c.drawString(2*inch, y_position - 1.3*inch, "• iOS: App Store download")
            
            # Contact info
            c.setFont("Helvetica", 10)
            c.drawCentredString(width/2, 2*inch, "Need help? Contact support@kimoel.com")
            c.drawCentredString(width/2, 1.5*inch, "© 2026 Kimoel Delivery Systems")
            
            c.save()
            
            pdf_path = os.path.join(output_dir, "qr-install-sheet.pdf")
            print(f"✅ Printable QR sheet generated: {pdf_path}")
            
            return pdf_path
            
        except ImportError:
            print("⚠️  ReportLab not installed. Install with: pip install reportlab")
            return None

def main():
    parser = argparse.ArgumentParser(description="Generate QR codes for Kimoel Driver App")
    parser.add_argument("--output", default="qr-codes", help="Output directory for QR codes")
    parser.add_argument("--driver-id", help="Generate personalized QR code for specific driver")
    parser.add_argument("--platform", choices=["android", "ios"], help="Generate platform-specific QR code")
    parser.add_argument("--printable", action="store_true", help="Generate printable PDF sheet")
    
    args = parser.parse_args()
    
    generator = QRCodeGenerator()
    
    if args.driver_id:
        # Generate personalized driver QR
        generator.generate_driver_onboarding_qr(args.driver_id, args.output)
    elif args.platform:
        # Generate platform-specific QR
        generator.generate_platform_qrs(args.output)
    else:
        # Generate main installation QR
        png_path, svg_path, install_url = generator.generate_installation_qr(args.output)
        
        # Also generate platform QRs
        generator.generate_platform_qrs(args.output)
        
        # Generate printable sheet if requested
        if args.printable:
            generator.create_printable_qr_sheet(args.output)
    
    print("\n🎉 QR Code generation complete!")
    print("📱 Scan the QR codes with your phone camera to install the app")

if __name__ == "__main__":
    main()
