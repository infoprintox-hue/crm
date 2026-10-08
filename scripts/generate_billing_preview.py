from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "visitinglink-invoice-margin-preview.pdf"
LOGO = ROOT / "public" / "assets" / "visitinglink-logo-invoice.png"

PURPLE = colors.HexColor("#6537C4")
SOFT = colors.HexColor("#F7F3FB")
LINE = colors.HexColor("#DDD3EB")
TEXT = colors.HexColor("#1B1B1F")
MUTED = colors.HexColor("#6F6976")
GREEN = colors.HexColor("#14824D")


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="InvoiceTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=29, textColor=TEXT, alignment=TA_LEFT, spaceAfter=0))
styles.add(ParagraphStyle(name="Eyebrow", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=PURPLE, spaceAfter=2))
styles.add(ParagraphStyle(name="BodySmall", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=12, textColor=TEXT))
styles.add(ParagraphStyle(name="MutedSmall", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5, leading=10, textColor=MUTED))
styles.add(ParagraphStyle(name="CardLabel", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=PURPLE, spaceAfter=4))
styles.add(ParagraphStyle(name="CardName", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=TEXT, spaceAfter=3))
styles.add(ParagraphStyle(name="Section", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=PURPLE, spaceBefore=6, spaceAfter=3))
styles.add(ParagraphStyle(name="LineItem", parent=styles["Normal"], fontName="Helvetica", fontSize=8.2, leading=12, textColor=TEXT))
styles.add(ParagraphStyle(name="LineItemStrong", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8.6, leading=12, textColor=TEXT))
styles.add(ParagraphStyle(name="Right", parent=styles["BodySmall"], alignment=TA_RIGHT))


def footer(canvas, doc):
    canvas.saveState()
    width, _ = A4
    left = 12 * mm
    right = width - 12 * mm
    y = 10 * mm
    canvas.setStrokeColor(colors.HexColor("#AAA4B4"))
    canvas.setDash(2, 2)
    canvas.line(left, y + 8 * mm, right, y + 8 * mm)
    canvas.setDash()
    canvas.setFont("Helvetica", 6.8)
    canvas.setFillColor(MUTED)
    canvas.drawString(left, y + 4.2 * mm, "Invoice No")
    canvas.drawString(left + 35 * mm, y + 4.2 * mm, "Invoice Date")
    canvas.drawString(left + 75 * mm, y + 4.2 * mm, "Billed To")
    canvas.setFont("Helvetica-Bold", 7.4)
    canvas.setFillColor(TEXT)
    canvas.drawString(left, y + 1 * mm, "INV1008")
    canvas.drawString(left + 35 * mm, y + 1 * mm, "19 Sept 2026")
    canvas.drawString(left + 75 * mm, y + 1 * mm, "SURAJ METAL INDUSTRIES")
    canvas.drawRightString(right, y + 1 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=23 * mm,
        title="Visitinglink Invoice Margin Preview",
        author="Visitinglink Business OS",
    )

    story = []
    story.append(Table([[""]], colWidths=[186 * mm], rowHeights=[1.2 * mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), PURPLE), ("BOX", (0, 0), (-1, -1), 0, PURPLE)])))
    story.append(Spacer(1, 5 * mm))

    logo = Image(str(LOGO), width=39 * mm, height=12.2 * mm)
    title = [Paragraph("INVOICE", styles["Eyebrow"]), Paragraph("Invoice", styles["InvoiceTitle"]), Paragraph("Professional website & company profile services", styles["MutedSmall"])]
    header = Table([[title, logo]], colWidths=[137 * mm, 49 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.extend([header, Spacer(1, 5 * mm)])

    meta = Table([
        [Paragraph("Document No.", styles["MutedSmall"]), Paragraph("<b>INV1008</b>", styles["Right"])],
        [Paragraph("Document Date", styles["MutedSmall"]), Paragraph("<b>19 Sept 2026</b>", styles["Right"])],
        [Paragraph("Due Date", styles["MutedSmall"]), Paragraph("<b>04 Oct 2026</b>", styles["Right"])],
    ], colWidths=[70 * mm, 108 * mm])
    meta.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE), ("BACKGROUND", (0, 0), (-1, -1), colors.white), ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm), ("TOPPADDING", (0, 0), (-1, -1), 1.6 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.6 * mm)]))
    story.extend([meta, Spacer(1, 4 * mm)])

    billed_by = [Paragraph("BILLED BY", styles["CardLabel"]), Paragraph("Visitinglink", styles["CardName"]), Paragraph("Uttar Pradesh, India<br/>GSTIN 09DLSPS3451M1Z5", styles["BodySmall"])]
    billed_to = [Paragraph("BILLED TO", styles["CardLabel"]), Paragraph("SURAJ METAL INDUSTRIES", styles["CardName"]), Paragraph("Jhansi, Uttar Pradesh, India", styles["BodySmall"])]
    parties = Table([[billed_by, billed_to]], colWidths=[91 * mm, 91 * mm], hAlign="LEFT")
    parties.setStyle(TableStyle([("BOX", (0, 0), (0, 0), 0.6, LINE), ("BOX", (1, 0), (1, 0), 0.6, LINE), ("LINEABOVE", (0, 0), (-1, 0), 2, PURPLE), ("BACKGROUND", (0, 0), (-1, -1), SOFT), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm), ("TOPPADDING", (0, 0), (-1, -1), 3.5 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm)]))
    story.extend([parties, Spacer(1, 4.5 * mm)])

    scope = [
        "Responsive website design for desktop, tablet and mobile",
        "Company, business and product information architecture",
        "Lead enquiry and request submission form",
        "WhatsApp and click-to-call integration",
        "Email notification workflow for enquiries",
        "Google Analytics and conversion tracking setup",
        "Basic serverless backend for visitor and enquiry data",
        "Search-friendly page structure and metadata",
        "Company profile content layout and key offerings",
        "Premium home page and service page presentation",
        "Contact, map and social profile integration",
        "Admin-managed lead status and follow-up workflow",
        "Mobile-first navigation and accessible typography",
        "Browser testing for current Chrome, Safari and Edge",
        "Performance optimisation for images and static assets",
        "SSL-ready deployment configuration",
        "Two rounds of design revision after first presentation",
        "Final handover with deployment and usage walkthrough",
    ]

    item_rows = [[Paragraph("Item", styles["LineItemStrong"]), Paragraph("Qty", styles["LineItemStrong"]), Paragraph("Rate", styles["LineItemStrong"]), Paragraph("Amount", styles["LineItemStrong"])]]
    item_rows.append([Paragraph("<b>1. Website Design + Profile Combo</b><br/><font color='#6F6976'>Complete digital presence package</font>", styles["LineItem"]), Paragraph("1", styles["Right"]), Paragraph("Rs. 20,300.00", styles["Right"]), Paragraph("Rs. 20,300.00", styles["Right"])])
    item_table = Table(item_rows, colWidths=[120 * mm, 16 * mm, 25 * mm, 25 * mm], repeatRows=1)
    item_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), PURPLE), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 2.5 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 2.5 * mm), ("TOPPADDING", (0, 0), (-1, -1), 2.5 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5 * mm)]))
    story.extend([item_table, Spacer(1, 3 * mm), Paragraph("PROJECT OVERVIEW", styles["Section"]), Paragraph("A professional and responsive business website for <b>SURAJ METAL INDUSTRIES</b>, designed to present the company, its offerings and business information in a clear and credible format.", styles["LineItem"]), Paragraph("WEBSITE SCOPE", styles["Section"])])
    for point in scope:
        story.append(Paragraph(f"•&nbsp;&nbsp;{point}", styles["LineItem"]))
        story.append(Spacer(1, 1.2 * mm))

    story.extend([Spacer(1, 3 * mm), Paragraph("DELIVERABLE", styles["Section"]), Paragraph("A complete professional website with the above communication, enquiry and analytics features, together with the agreed company profile presentation.", styles["LineItem"]), Spacer(1, 4 * mm)])

    totals = Table([
        [Paragraph("Subtotal", styles["BodySmall"]), Paragraph("Rs. 20,300.00", styles["Right"])],
        [Paragraph("CGST (9%) + SGST (9%)", styles["BodySmall"]), Paragraph("Rs. 3,654.00", styles["Right"])],
        [Paragraph("<b>Total (INR)</b>", styles["BodySmall"]), Paragraph("<b>Rs. 23,954.00</b>", styles["Right"])],
    ], colWidths=[45 * mm, 35 * mm], hAlign="RIGHT")
    totals.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 1), 0.5, LINE), ("BACKGROUND", (0, 2), (-1, 2), PURPLE), ("TEXTCOLOR", (0, 2), (-1, 2), colors.white), ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm), ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm)]))
    story.extend([totals, Spacer(1, 3 * mm), Paragraph("<b>Total in words:</b> TWENTY THREE THOUSAND NINE HUNDRED FIFTY FOUR RUPEES ONLY", styles["BodySmall"]), Spacer(1, 5 * mm)])

    payment = Table([[
        [Paragraph("BANK ACCOUNT", styles["CardLabel"]), Paragraph("<b>HILO TECHNOLOGIES</b><br/>HDFC Bank · 50200089109692<br/>IFSC HDFC0000453", styles["BodySmall"])],
        [Paragraph("PAYMENT STATUS", styles["CardLabel"]), Paragraph("<b><font color='#14824D'>PAID / UNPAID / PART-PAID</font></b><br/>Status is derived from recorded payments.", styles["BodySmall"])],
    ]], colWidths=[91 * mm, 91 * mm])
    payment.setStyle(TableStyle([("BOX", (0, 0), (0, 0), 0.6, LINE), ("BOX", (1, 0), (1, 0), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm), ("TOPPADDING", (0, 0), (-1, -1), 3.5 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm)]))
    story.extend([payment, Spacer(1, 5 * mm), Paragraph("TERMS AND CONDITIONS", styles["Section"]), Paragraph("01&nbsp;&nbsp; No refund after any payment has been processed.", styles["BodySmall"]), Paragraph("02&nbsp;&nbsp; Please quote the invoice number when remitting funds.", styles["BodySmall"]), Paragraph("03&nbsp;&nbsp; Payment is due within 15 days from the invoice date.", styles["BodySmall"]), Spacer(1, 5 * mm), Paragraph("For any enquiry, email info.visitinglink@gmail.com or call +91 70070 30484", styles["MutedSmall"]), Spacer(1, 3 * mm), Paragraph("This is an electronically generated document; no signature is required.", styles["MutedSmall"])])

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build()
