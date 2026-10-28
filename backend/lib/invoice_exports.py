"""Render the saved invoice as PDF or fill the owner's original Excel template."""

from copy import deepcopy
from datetime import date
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from lib.invoices import BILLING_LABELS, Invoice, LINE_LABELS

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "invoice-template.xlsx"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
ET.register_namespace("x", NS)


def export_xlsx(invoice: Invoice) -> bytes:
    """Keep all template styles, print settings and the original embedded logo."""
    with ZipFile(TEMPLATE) as source:
        sheet = ET.fromstring(source.read("xl/worksheets/sheet1.xml"))
        cells = {cell.get("r"): cell for cell in sheet.iter(f"{{{NS}}}c")}
        styles = ET.fromstring(source.read("xl/styles.xml"))
        formats = styles.find(f"{{{NS}}}numFmts")
        if formats is None:
            formats = ET.Element(f"{{{NS}}}numFmts")
            styles.insert(0, formats)
        cell_styles = styles.find(f"{{{NS}}}cellXfs")

        def number_style(ref, code):
            format_id = max([163] + [int(item.get("numFmtId")) for item in formats]) + 1
            ET.SubElement(formats, f"{{{NS}}}numFmt", numFmtId=str(format_id), formatCode=code)
            formats.set("count", str(len(formats)))
            style = deepcopy(cell_styles[int(cells[ref].get("s", "0"))])
            style.set("numFmtId", str(format_id))
            style.set("applyNumberFormat", "1")
            cells[ref].set("s", str(len(cell_styles)))
            cell_styles.append(style)
            cell_styles.set("count", str(len(cell_styles)))

        number_style("F5", "dd/mm/yyyy")
        number_style("E26", '0.00"%"')
        number_style("E28", '0.00"%"')
        number_style("E29", '0.00"%"')
        for row in range(19, 25):
            number_style(f"D{row}", "#,##0")

        def write(ref, value, formula=None):
            cell = cells[ref]
            for child in list(cell):
                cell.remove(child)
            cell.attrib.pop("t", None)
            if isinstance(value, str):
                # Inline strings cannot turn a client name or note into an Excel formula.
                cell.set("t", "inlineStr")
                text = ET.SubElement(ET.SubElement(cell, f"{{{NS}}}is"), f"{{{NS}}}t")
                text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                text.text = value
            else:
                if formula:
                    ET.SubElement(cell, f"{{{NS}}}f").text = formula
                ET.SubElement(cell, f"{{{NS}}}v").text = str(value)

        supplier = invoice.supplier
        services_only = invoice.billing_mode == "services_only"
        write("D2", "INVOICE")
        write("F4", invoice.invoice_number)
        write("F5", (invoice.invoice_date - date(1899, 12, 30)).days)
        write("A7", f"Mysore, Karnataka  |  {supplier.phone}")
        write("A8", f"{supplier.email}  |  {supplier.website}")
        write("A9", supplier.address)
        write("A11", f"GSTIN: {supplier.gstin}" if supplier.gstin else "")
        write("A13", invoice.client_name)
        write("A14", invoice.client_address + (f"\nGSTIN: {invoice.client_gstin}" if invoice.client_gstin else ""))
        write("D13", invoice.billing_period)
        write("D14", f"Payment due: {invoice.due_date.strftime('%d/%m/%Y')}" if invoice.due_date else "")
        write("A30", supplier.payment_details)
        write("A35", f"Notes: {invoice.notes}" if invoice.notes else "")
        write("D35", f"For {supplier.name}")
        totals = invoice.totals
        if services_only:
            write("A18", "Services only - wages for service charges")
            write("A19", "    Manpower supply")
            write("E17", "Wages (INR)")
            write("F17", "Wage total (INR)")
            for row in [*range(19, 26), 27]:
                for column in "DEF":
                    write(f"{column}{row}", 0)
            for row in sheet.findall(f"{{{NS}}}sheetData/{{{NS}}}row"):
                if int(row.get("r")) in (21, 22, 23, 24, 27):
                    row.set("hidden", "1")
            write("A25", "Wage subtotal (reference only)")
            write("C25", "")
            write("D25", "")
            write("E25", "")
            write("F25", totals.base_amount, "SUM(F19:F20)")
        for line in invoice.lines:
            row = 27 if line.key == "other" else list(invoice.line_labels).index(line.key) + 19
            write(f"D{row}", line.quantity)
            write(f"E{row}", line.rate)
            write(f"F{row}", totals.line_amounts[line.key], f"ROUND(D{row}*E{row},2)")
        write("E26", invoice.service_percentage)
        write("F26", totals.service_charge, "ROUND(F25*E26/100,2)" if services_only else "ROUND(SUM(F19:F25,F27)*E26/100,2)")
        if services_only:
            write("F29", totals.subtotal, "F26")
            write("D29", "Service charges")
        else:
            # Use the template's spare row and former subtotal row so ESI and
            # PF remain visible and editable without moving payment details.
            merges = sheet.find(f"{{{NS}}}mergeCells")
            for merge in list(merges):
                if merge.get("ref") == "D29:E29":
                    merges.remove(merge)
            merges.set("count", str(len(merges)))
            for row, label, percentage, contribution in (
                (28, "ESI (%)", invoice.esi_percentage, totals.esi_amount),
                (29, "PF (%)", invoice.pf_percentage, totals.pf_amount),
            ):
                cells[f"E{row}"].set("s", cells["E26"].get("s"))
                cells[f"F{row}"].set("s", cells["F30"].get("s"))
                write(f"D{row}", label)
                write(f"E{row}", percentage)
                write(f"F{row}", contribution, f"ROUND(SUM(F19:F25,F27)*E{row}/100,2)")
        if invoice.uses_gst_percentages:
            # The template's spare row holds SGST without moving payment details
            # or the total. Unmerge the old GST label to expose the rate input.
            merges = sheet.find(f"{{{NS}}}mergeCells")
            for merge in list(merges):
                if merge.get("ref") == "D30:E30":
                    merges.remove(merge)
            merges.set("count", str(len(merges)))
            for row, label, percentage, tax in (
                (30, "CGST (%)", invoice.cgst_percentage, totals.cgst_amount),
                (31, "SGST (%)", invoice.sgst_percentage, totals.sgst_amount),
            ):
                cells[f"E{row}"].set("s", cells["E26"].get("s"))
                cells[f"F{row}"].set("s", cells["F30"].get("s"))
                write(f"D{row}", label)
                write(f"E{row}", percentage)
                tax_base = "$F$29" if services_only else "SUM($F$19:$F$29)"
                write(f"F{row}", tax, f"ROUND({tax_base}*E{row}/100,2)")
            write("F32", totals.total, "SUM(F29:F31)" if services_only else "SUM(F19:F31)")
            write("A39", "Amounts in INR. Wages are reference only. GST applies only to service charges." if services_only else "Amounts in INR. ESI, PF and service charges are percentages of charges before GST. CGST and SGST apply to the resulting subtotal.")
        else:
            write("F30", totals.gst_amount)
            write("F32", totals.total, "SUM(F29:F30)" if services_only else "SUM(F19:F30)")
            write("A39", "Amounts in INR. Wages are reference only. Total = service charges + recorded GST." if services_only else "Amounts in INR. ESI, PF and service charges are percentages of charges before GST. GST is the amount recorded on this invoice.")

        output = BytesIO()
        with ZipFile(output, "w", ZIP_DEFLATED) as target:
            for name in source.namelist():
                data = source.read(name)
                if name == "xl/worksheets/sheet1.xml":
                    data = ET.tostring(sheet, encoding="utf-8", xml_declaration=True)
                elif name == "xl/styles.xml":
                    data = ET.tostring(styles, encoding="utf-8", xml_declaration=True)
                elif name == "xl/workbook.xml":
                    root = ET.fromstring(data)
                    calc = root.find(f"{{{NS}}}calcPr")
                    if calc is None:
                        calc = ET.SubElement(root, f"{{{NS}}}calcPr")
                    calc.set("fullCalcOnLoad", "1")
                    calc.set("calcMode", "auto")
                    data = ET.tostring(root, encoding="utf-8", xml_declaration=True)
                target.writestr(name, data)
    return output.getvalue()


def export_pdf(invoice: Invoice) -> bytes:
    import reportlab
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    output = BytesIO()
    # Embed the fonts shipped with ReportLab so PDFs do not rely on a viewer's
    # substitute for the standard Helvetica fonts.
    fonts = Path(reportlab.__file__).parent / "fonts"
    for name, file in (("InvoiceSans", "Vera.ttf"), ("InvoiceSansBold", "VeraBd.ttf")):
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(fonts / file)))
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=30, bottomMargin=36,
                            title=invoice.invoice_number, author=invoice.supplier.name)
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("InvoiceBody", parent=styles["Normal"], fontName="InvoiceSans", fontSize=9, leading=13, alignment=TA_LEFT, textColor=colors.HexColor("#0F2444"))
    small = ParagraphStyle("InvoiceSmall", parent=normal, fontSize=8, leading=11)
    bold = ParagraphStyle("InvoiceBold", parent=normal, fontName="InvoiceSansBold")
    heading = ParagraphStyle("InvoiceHeading", parent=normal, fontName="InvoiceSansBold", fontSize=11, leading=15)
    center = ParagraphStyle("InvoiceCenter", parent=normal, alignment=TA_CENTER)
    small_center = ParagraphStyle("InvoiceSmallCenter", parent=small, alignment=TA_CENTER)
    right = ParagraphStyle("InvoiceRight", parent=normal, alignment=TA_RIGHT)

    def p(text, style=normal):
        return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)

    def amount(value):
        return f"{value:,.2f}"

    with ZipFile(TEMPLATE) as archive:
        logo = Image(BytesIO(archive.read("xl/media/image.png")), width=100, height=68.2)
    metadata = [p("INVOICE", heading), p(invoice.invoice_number, heading), p(f"Date: {invoice.invoice_date:%d/%m/%Y}"),
                p(BILLING_LABELS[invoice.billing_mode], bold),
                p(f"Payment due: {invoice.due_date:%d/%m/%Y}" if invoice.due_date else "")]
    story = [Table([[logo, metadata]], colWidths=[doc.width * .58, doc.width * .42]), Spacer(1, 12)]
    supplier = invoice.supplier
    story.extend([p(supplier.name, heading), p(supplier.address), p(f"{supplier.phone}  |  {supplier.email}", small),
                  p(supplier.website, small), p(f"GSTIN: {supplier.gstin}" if supplier.gstin else "", small), Spacer(1, 14)])
    billed = [p("BILL TO", heading), p(invoice.client_name), p(invoice.client_address), p(f"GSTIN: {invoice.client_gstin}" if invoice.client_gstin else "")]
    period = [p("BILLING PERIOD", heading), p(invoice.billing_period or "-")]
    details = Table([[billed, period]], colWidths=[doc.width * .58, doc.width * .42])
    details.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F5F9")), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.extend([details, Spacer(1, 10)])
    services_only = invoice.billing_mode == "services_only"
    rows = [[p("Description", small), p("Men / Women", small), p("Quantity", small_center), p("Wage / person (INR)" if services_only else "Rate (INR)", small), p("Wage total (INR)" if services_only else "Amount (INR)", small)]]
    for line in invoice.lines:
        label, gender = invoice.line_labels[line.key]
        rows.append([p(label, small), p(gender, small), p(f"{line.quantity:g}", center), p(amount(line.rate)), p(amount(invoice.totals.line_amounts[line.key]))])
    table = Table(rows, colWidths=[doc.width * .31, doc.width * .16, doc.width * .13, doc.width * .19, doc.width * .21], repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, -1), .4, colors.HexColor("#CBD5E1")), ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5)]))
    story.extend([table, Spacer(1, 8)])
    totals = invoice.totals
    tax_rows = [
        [p(f"CGST ({invoice.cgst_percentage:g}%)"), p(amount(totals.cgst_amount))],
        [p(f"SGST ({invoice.sgst_percentage:g}%)"), p(amount(totals.sgst_amount))],
    ] if invoice.uses_gst_percentages else [[p("GST (recorded amount)"), p(amount(totals.gst_amount))]]
    # Wages cover the six workforce rows. Keep extras separate so the wage label
    # remains accurate without changing the saved service-charge or GST totals.
    wages = totals.base_amount - totals.line_amounts.get("overtime", 0) - totals.line_amounts.get("other", 0)
    additional_rows = [
        [p(LINE_LABELS[key][0]), p(amount(totals.line_amounts[key]))]
        for key in ("overtime", "other") if totals.line_amounts.get(key)
    ]
    summary = Table([
        [p("Wage subtotal (reference only)" if services_only else "Total wages"), p(amount(wages))],
        *additional_rows,
        *([] if services_only else [
            [p(f"ESI ({invoice.esi_percentage:g}%)"), p(amount(totals.esi_amount))],
            [p(f"PF ({invoice.pf_percentage:g}%)"), p(amount(totals.pf_amount))],
        ]),
        [p(f"Service charge ({invoice.service_percentage:g}%)"), p(amount(totals.service_charge))],
        *([] if services_only else [[p("Subtotal before GST"), p(amount(totals.subtotal))]]),
        *tax_rows,
        [p("TOTAL (INR)", heading), p(amount(totals.total), bold)],
    ], colWidths=[doc.width * .79, doc.width * .21])
    summary.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFEDD5"))]))
    story.extend([summary, Spacer(1, 8)])
    if services_only:
        story.extend([p("Wages are used only to calculate service charges. Total payable includes service charges and GST.", small), Spacer(1, 8)])
    if supplier.payment_details:
        story.extend([p("PAYMENT DETAILS", heading), p(supplier.payment_details), Spacer(1, 8)])
    if invoice.notes:
        story.extend([p("Notes", heading), p(invoice.notes), Spacer(1, 8)])
    story.append(KeepTogether([p(f"For {supplier.name}", right), Spacer(1, 16), p("Authorised signatory", right)]))

    def footer(canvas, document):
        canvas.setFont("InvoiceSans", 8)
        canvas.setFillColor(colors.HexColor("#64748B"))
        canvas.drawString(36, 19, invoice.invoice_number)
        canvas.drawRightString(A4[0] - 36, 19, f"Page {document.page}")

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
