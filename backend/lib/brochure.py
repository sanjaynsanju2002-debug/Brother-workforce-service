"""Public company brochure; all copy is based on the published service offering."""

from io import BytesIO
from pathlib import Path

import reportlab
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def company_brochure() -> bytes:
    fonts = Path(reportlab.__file__).parent / "fonts"
    for name, filename in (("BrochureSans", "Vera.ttf"), ("BrochureBold", "VeraBd.ttf")):
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(fonts / filename)))
    output = BytesIO()
    navy = colors.HexColor("#0F2444")
    orange = colors.HexColor("#C2410C")
    body = ParagraphStyle("body", fontName="BrochureSans", fontSize=10, leading=15, textColor=navy, alignment=TA_LEFT)
    heading = ParagraphStyle("heading", parent=body, fontName="BrochureBold", fontSize=16, leading=21, spaceAfter=8)
    small = ParagraphStyle("small", parent=body, fontSize=9, leading=13)
    doc = SimpleDocTemplate(output, pagesize=(210 * mm, 297 * mm), rightMargin=19 * mm, leftMargin=19 * mm,
                            topMargin=18 * mm, bottomMargin=16 * mm, title="Brothers Workforce Solutions - Company Profile", author="Brothers Workforce Solutions")
    story = [Paragraph("BROTHERS<br/>WORKFORCE SOLUTIONS", ParagraphStyle("title", parent=heading, fontSize=28, leading=32)),
             Paragraph("Connecting Talent Creating Success", ParagraphStyle("tagline", parent=body, textColor=orange, fontSize=12)),
             Spacer(1, 7 * mm), Paragraph("Workforce support in Mysore &amp; across Karnataka", heading),
             Paragraph("Staffing and recruitment support for factories, production units, warehouses and technical operations. Talk to our team about your role, location, shift and workforce requirement.", body), Spacer(1, 7 * mm)]
    cards = [
        ("Skilled &amp; technical roles", "Machine operators, technicians, electricians, welders and fitters."),
        ("Production &amp; assembly", "Semi-skilled production, assembly, quality support and packaging roles."),
        ("Warehouse &amp; general workforce", "Picking, packing, loading, material handling and dispatch support."),
        ("Workforce administration", "Deployment coordination, payroll support and documented workforce processes."),
    ]
    for title, text in cards:
        story.append(KeepTogether([Paragraph(title, ParagraphStyle("card", parent=heading, fontSize=12, leading=16, spaceAfter=3)), Paragraph(text, body), Spacer(1, 4 * mm)]))
    story += [Spacer(1, 3 * mm), Paragraph("For employers", heading),
              Paragraph("Share the job role, number of workers, work location, shift and joining date. Our team will review the requirement and contact you to confirm details. Timing and commercial terms are agreed for each requirement.", body),
              Spacer(1, 5 * mm), Paragraph("For candidates", heading),
              Paragraph("View current jobs and register your profile on our website. Candidates pay no service or application fee. A resume is optional. Shortlisting and interviews depend on the role and employer requirements; registration does not guarantee employment.", body),
              Spacer(1, 6 * mm)]
    contact = [[Paragraph("CONTACT OUR WORKFORCE DESK", ParagraphStyle("contact", parent=body, fontName="BrochureBold", textColor=colors.white))],
               [Paragraph("Phone / WhatsApp: +91 96063 33542<br/>Email: brothersworkforcesolutions@gmail.com<br/>Website: brothersworkforcesolutions.in", ParagraphStyle("contactbody", parent=small, textColor=colors.white))]]
    table = Table(contact, colWidths=[172 * mm])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), navy), ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10), ("LEFTPADDING", (0, 0), (-1, -1), 12)]))
    story += [table, Spacer(1, 5 * mm), Paragraph("Office: 1, Boregowda Complex, Belavadi Main Rd, near Canara Bank, Krishnappa Block, Mysore, Karnataka 570018.<br/>GSTIN: 29EQOPR8753K1ZM", small)]
    doc.build(story)
    return output.getvalue()
