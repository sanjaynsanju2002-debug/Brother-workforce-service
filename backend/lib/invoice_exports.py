"""Render the saved invoice as PDF or fill the owner's original Excel template."""

from copy import deepcopy
from datetime import date
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from lib.invoices import BILLING_LABELS, Invoice, LINE_LABELS, calculate_invoice, default_lines

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "invoice-template.xlsx"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
ET.register_namespace("x", NS)


def export_xlsx(invoice: Invoice) -> bytes:
    """Keep all template styles, print settings and the original embedded logo."""
    if invoice.lines[0].is_custom:
        return export_custom_xlsx(invoice)
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


def export_custom_xlsx(invoice: Invoice) -> bytes:
    """Use the original branded header with editable, variable invoice items."""
    placeholder = invoice.model_copy(update={"lines": default_lines(invoice.billing_mode)})
    placeholder = placeholder.model_copy(update={"totals": calculate_invoice(placeholder)})
    with ZipFile(BytesIO(export_xlsx(placeholder))) as source:
        sheet = ET.fromstring(source.read("xl/worksheets/sheet1.xml"))
        data = sheet.find(f"{{{NS}}}sheetData")
        original = {cell.get("r"): cell for cell in sheet.iter(f"{{{NS}}}c")}
        style_ids = {column: original[f"{column}19"].get("s", "0") for column in "ABCDEF"}
        styles = ET.fromstring(source.read("xl/styles.xml"))
        cell_styles = styles.find(f"{{{NS}}}cellXfs")
        for column in "AC":
            style = deepcopy(cell_styles[int(style_ids[column])])
            alignment = style.find(f"{{{NS}}}alignment")
            if alignment is None:
                alignment = ET.SubElement(style, f"{{{NS}}}alignment")
            alignment.attrib.update(horizontal="left", vertical="top", wrapText="1")
            style_ids[column] = str(len(cell_styles))
            cell_styles.append(style)
        # Quantities may describe units or half days, rather than fixed worker groups.
        formats = styles.find(f"{{{NS}}}numFmts")
        format_id = max([163] + [int(item.get("numFmtId")) for item in formats]) + 1
        ET.SubElement(formats, f"{{{NS}}}numFmt", numFmtId=str(format_id), formatCode="0.##")
        formats.set("count", str(len(formats)))
        style = deepcopy(cell_styles[int(style_ids["D"])])
        style.attrib.update(numFmtId=str(format_id), applyNumberFormat="1")
        style_ids["D"] = str(len(cell_styles))
        cell_styles.append(style)
        cell_styles.set("count", str(len(cell_styles)))

        for row in list(data):
            if int(row.get("r")) >= 18:
                data.remove(row)
        merges = sheet.find(f"{{{NS}}}mergeCells")
        for merge in list(merges):
            if any(int(part.lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ")) >= 18 for part in merge.get("ref").split(":")):
                merges.remove(merge)

        def merge(ref):
            ET.SubElement(merges, f"{{{NS}}}mergeCell", ref=ref)

        def add_row(number, height=24):
            return ET.SubElement(data, f"{{{NS}}}row", r=str(number), ht=str(height), customHeight="1")

        def write(row, column, value, style_id=None, formula=None):
            cell = ET.SubElement(row, f"{{{NS}}}c", r=f'{column}{row.get("r")}', s=str(style_id if style_id is not None else style_ids[column]))
            if isinstance(value, str):
                cell.set("t", "inlineStr")
                text = ET.SubElement(ET.SubElement(cell, f"{{{NS}}}is"), f"{{{NS}}}t")
                text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                text.text = value
            else:
                if formula:
                    ET.SubElement(cell, f"{{{NS}}}f").text = formula
                ET.SubElement(cell, f"{{{NS}}}v").text = str(value)

        header = next(row for row in data if row.get("r") == "17")
        for cell in list(header):
            header.remove(cell)
        for column, label in {"A": "Category", "B": "", "C": "Description", "D": "Quantity", "E": "Rate (INR)", "F": "Amount (INR)"}.items():
            write(header, column, label, original[f"{column}17"].get("s"))
        for column in sheet.find(f"{{{NS}}}cols"):
            column.set("width", {"1": "7", "2": "17", "3": "40", "4": "10", "5": "18", "6": "22"}[column.get("min")])

        def text_height(text, width):
            return max(1, sum(max(1, (len(part) + width - 1) // width) for part in text.split("\n")))

        for number, line in enumerate(invoice.lines, 18):
            height = max(30, 14 * max(text_height(line.category, 22), text_height(line.description, 38)))
            row = add_row(number, height)
            for column, value in {"A": line.category, "B": "", "C": line.description, "D": line.quantity, "E": line.rate}.items():
                write(row, column, value)
            formula = f"ROUND(D{number}*E{number},2)" if line.amount is None else None
            write(row, "F", invoice.totals.line_amounts[line.key], formula=formula)
            merge(f"A{number}:B{number}")

        number = 18 + len(invoice.lines)
        total_style = original["F29"].get("s")
        label_style = original["D29"].get("s")
        percent_style = original["E26"].get("s")

        def summary(label, value, formula=None, percentage=None, primary=False):
            nonlocal number
            row = add_row(number, 27 if primary else 24)
            write(row, "A", label, original["D32"].get("s") if primary else label_style)
            merge(f'A{number}:{"E" if percentage is None else "D"}{number}')
            if percentage is not None:
                write(row, "E", percentage, percent_style)
            write(row, "F", value, original["F32"].get("s") if primary else total_style, formula)
            ref = f"F{number}"
            number += 1
            return ref

        totals = invoice.totals
        services_only = invoice.billing_mode == "services_only"
        base = summary("Wage subtotal (reference only)" if services_only else "Charges before ESI, PF and service fee", totals.base_amount, f"SUM(F18:F{number - 1})")
        components = [base]
        if not services_only:
            for label, percentage, value in (("ESI (%)", invoice.esi_percentage, totals.esi_amount), ("PF (%)", invoice.pf_percentage, totals.pf_amount)):
                components.append(summary(label, value, f"ROUND({base}*E{number}/100,2)", percentage))
        service = summary("Service charge (%)", totals.service_charge, f"ROUND({base}*E{number}/100,2)", invoice.service_percentage)
        subtotal = service if services_only else summary("Subtotal before GST", totals.subtotal, f'SUM({",".join([*components, service])})')
        tax_refs = []
        if invoice.uses_gst_percentages:
            for label, percentage, value in (("CGST (%)", invoice.cgst_percentage, totals.cgst_amount), ("SGST (%)", invoice.sgst_percentage, totals.sgst_amount)):
                tax_refs.append(summary(label, value, f"ROUND({subtotal}*E{number}/100,2)", percentage))
        else:
            tax_refs.append(summary("GST (recorded amount)", totals.gst_amount))
        summary("TOTAL (INR)", totals.total, f'SUM({",".join([subtotal, *tax_refs])})', primary=True)

        number += 1
        row = add_row(number)
        write(row, "A", "PAYMENT DETAILS", original["A29"].get("s"))
        merge(f"A{number}:F{number}")
        number += 1
        row = add_row(number, max(30, 14 * text_height(invoice.supplier.payment_details, 105)))
        write(row, "A", invoice.supplier.payment_details, original["A30"].get("s"))
        merge(f"A{number}:F{number}")
        number += 2
        row = add_row(number, max(30, 14 * text_height(invoice.notes, 105)))
        write(row, "A", f"Notes: {invoice.notes}" if invoice.notes else "", original["A35"].get("s"))
        merge(f"A{number}:F{number}")
        number += 2
        row = add_row(number)
        write(row, "D", f"For {invoice.supplier.name}", original["D35"].get("s"))
        merge(f"D{number}:F{number}")
        number += 2
        row = add_row(number)
        write(row, "D", "Authorised signatory", original["D37"].get("s"))
        merge(f"D{number}:F{number}")
        number += 2
        row = add_row(number, 34)
        note = "Amounts in INR. Wages are reference only. Only service charges and GST are payable." if services_only else "Amounts in INR. ESI, PF and service charges use the item subtotal. GST uses the subtotal after these charges."
        write(row, "A", note + " Entered row totals are retained; other amounts use quantity x rate.", original["A39"].get("s"))
        merge(f"A{number}:F{number}")
        merges.set("count", str(len(merges)))
        setup = ET.SubElement(sheet, f"{{{NS}}}pageSetup", paperSize="9", orientation="portrait", fitToWidth="1", fitToHeight="0")
        sheet.remove(setup)
        sheet.insert(list(sheet).index(sheet.find(f"{{{NS}}}drawing")), setup)
        sheet_pr = ET.Element(f"{{{NS}}}sheetPr")
        ET.SubElement(sheet_pr, f"{{{NS}}}pageSetUpPr", fitToPage="1")
        sheet.insert(0, sheet_pr)
        workbook = ET.fromstring(source.read("xl/workbook.xml"))
        defined = ET.Element(f"{{{NS}}}definedNames")
        workbook.insert(list(workbook).index(workbook.find(f"{{{NS}}}calcPr")), defined)
        ET.SubElement(defined, f"{{{NS}}}definedName", name="_xlnm.Print_Area", localSheetId="0").text = f"'Invoice'!$A$1:$F${number}"
        ET.SubElement(defined, f"{{{NS}}}definedName", name="_xlnm.Print_Titles", localSheetId="0").text = "'Invoice'!$17:$17"
        output = BytesIO()
        with ZipFile(output, "w", ZIP_DEFLATED) as target:
            for name in source.namelist():
                body = source.read(name)
                if name == "xl/worksheets/sheet1.xml":
                    body = ET.tostring(sheet, encoding="utf-8", xml_declaration=True)
                elif name == "xl/styles.xml":
                    body = ET.tostring(styles, encoding="utf-8", xml_declaration=True)
                elif name == "xl/workbook.xml":
                    body = ET.tostring(workbook, encoding="utf-8", xml_declaration=True)
                target.writestr(name, body)
        return output.getvalue()


def export_pdf(invoice: Invoice) -> bytes:
    import reportlab
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Image, KeepTogether, LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

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
    custom = invoice.lines[0].is_custom
    rows = [[p("Category" if custom else "Description", small), p("Description" if custom else "Men / Women", small), p("Quantity", small_center), p("Rate (INR)" if custom or not services_only else "Wage / person (INR)", small), p("Amount (INR)" if custom or not services_only else "Wage total (INR)", small)]]
    for line in invoice.lines:
        category, description = (line.category, line.description) if custom else invoice.line_labels[line.key]
        rows.append([p(category, small), p(description, small), p(f"{line.quantity:g}", center), p(amount(line.rate)), p(amount(invoice.totals.line_amounts[line.key]))])
    widths = [.20, .36, .10, .15, .19] if custom else [.31, .16, .13, .19, .21]
    # Keep ordinary descriptions together. Only exceptionally tall multi-line
    # items need splitting inside a row rather than moving to the next page.
    split_tall_rows = any(line.description.count("\n") > 50 or line.category.count("\n") > 50 for line in invoice.lines)
    table = LongTable(rows, colWidths=[doc.width * width for width in widths], repeatRows=1, splitInRow=int(split_tall_rows))
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, -1), .4, colors.HexColor("#CBD5E1")), ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5)]))
    story.extend([table, Spacer(1, 8)])
    if custom and any(line.amount is not None for line in invoice.lines):
        story.extend([p("Entered row amounts are retained; other rows use quantity x rate.", small), Spacer(1, 6)])
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
        [p("Wage subtotal (reference only)" if services_only else "Item subtotal" if custom else "Total wages"), p(amount(wages))],
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
