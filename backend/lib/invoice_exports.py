"""Render the saved invoice as PDF or fill the owner's original Excel template."""

from copy import deepcopy
from datetime import date
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from lib.invoices import BILLING_LABELS, Invoice, LINE_LABELS, calculate_invoice, default_lines
from lib.months import month_label

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
    """Executive letterhead with flowing items and the saved invoice arithmetic."""
    import reportlab
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Image, KeepTogether, LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    output = BytesIO()
    fonts = Path(reportlab.__file__).parent / "fonts"
    for name, file in (("InvoiceSans", "Vera.ttf"), ("InvoiceSansBold", "VeraBd.ttf")):
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(fonts / file)))
    navy, orange = colors.HexColor("#0F2444"), colors.HexColor("#F26522")
    muted, light, border = (colors.HexColor(v) for v in ("#617082", "#F2F5F8", "#DCE3EB"))
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=30, bottomMargin=48,
                            title=invoice.invoice_number, author=invoice.supplier.name)
    normal = ParagraphStyle("ExecutiveBody", fontName="InvoiceSans", fontSize=8.5, leading=12, textColor=navy, alignment=TA_LEFT)
    small = ParagraphStyle("ExecutiveSmall", parent=normal, fontSize=8, leading=11, textColor=muted)
    bold = ParagraphStyle("ExecutiveBold", parent=normal, fontName="InvoiceSansBold")
    heading = ParagraphStyle("ExecutiveHeading", parent=bold, fontSize=11, leading=15)
    label = ParagraphStyle("ExecutiveLabel", parent=bold, fontSize=8, leading=12, textColor=orange)
    title = ParagraphStyle("ExecutiveTitle", parent=bold, fontSize=28, leading=36)
    table_head = ParagraphStyle("ExecutiveTableHead", parent=bold, fontSize=7.5, leading=10, textColor=colors.white)
    right = ParagraphStyle("ExecutiveRight", parent=normal, alignment=TA_RIGHT)

    def p(text, style=normal):
        return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)

    def number(value, width, *, total=False):
        text = f"{value:,.2f}"
        font = "InvoiceSansBold" if total else "InvoiceSans"
        preferred = 17 if total else 8.5
        size = min(preferred, (width - 18) / max(pdfmetrics.stringWidth(text, font, 1), 1))
        style = ParagraphStyle("ExecutiveAmount", parent=right, fontName=font,
                               fontSize=size, leading=max(12, size + 3), textColor=colors.white if total else navy)
        return p(text, style)

    def table(rows, widths, commands=()):
        result = Table(rows, colWidths=widths, hAlign="LEFT")
        result.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0), *commands]))
        return result

    with ZipFile(TEMPLATE) as archive:
        logo = Image(BytesIO(archive.read("xl/media/image.png")), width=132, height=90)
    left_width, right_width = doc.width * .57, doc.width * .43
    story = [table([[logo, [Spacer(1, 17), p("INVOICE", title), p(BILLING_LABELS[invoice.billing_mode], small)]]],
                   [left_width, right_width]), Spacer(1, 7)]
    rule = table([[""]], [doc.width], [("LINEABOVE", (0, 0), (-1, -1), .8, orange)])
    story.extend([rule, Spacer(1, 10)])
    supplier = invoice.supplier
    business = [p(supplier.name, heading), p(supplier.address, small)]
    if supplier.gstin:
        business.append(p(f"GSTIN: {supplier.gstin}", small))
    business.extend(p(value, small) for value in (supplier.phone, supplier.email, supplier.website) if value)
    metadata = table([[p(key, small), p(value, ParagraphStyle("ExecutiveMetaValue", parent=bold, alignment=TA_RIGHT))]
        for key, value in (
            ("Invoice no.", invoice.invoice_number), ("Invoice date", invoice.invoice_date.strftime("%d/%m/%Y")),
            ("Payment due", invoice.due_date.strftime("%d/%m/%Y") if invoice.due_date else "-"),
            ("Service month", month_label(invoice.service_month) if invoice.service_month else "-"),
        )], [right_width * .43, right_width * .57], [("BOTTOMPADDING", (0, 0), (-1, -1), 8)])
    story.extend([table([[business, metadata]], [left_width, right_width], [
        ("RIGHTPADDING", (0, 0), (0, 0), 18)]), Spacer(1, 17)])
    billed = [p("BILL TO", label), Spacer(1, 6), p(invoice.client_name, heading), p(invoice.client_address, small)]
    if invoice.client_gstin:
        billed.append(p(f"GSTIN: {invoice.client_gstin}", small))
    details = table([[billed, [p("BILLING PERIOD", label), Spacer(1, 6), p(invoice.billing_period or "-", bold)]]],
                    [doc.width * .67, doc.width * .33], [
        ("BACKGROUND", (0, 0), (-1, -1), light), ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 11),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 11)])
    story.extend([details, Spacer(1, 17)])
    services_only = invoice.billing_mode == "services_only"
    custom = invoice.lines[0].is_custom
    widths = [doc.width * width for width in ([.19, .30, .11, .18, .22] if custom else [.28, .15, .13, .20, .24])]
    headers = ["Category" if custom else "Description", "Description" if custom else "Men / Women", "Quantity",
               "Rate (INR)" if custom or not services_only else "Wage / person (INR)",
               "Amount (INR)" if custom or not services_only else "Wage total (INR)"]
    rows = [[p(text, ParagraphStyle("ExecutiveHeaderCell", parent=table_head, alignment=TA_RIGHT if i >= 2 else TA_LEFT))
             for i, text in enumerate(headers)]]
    for item in invoice.lines:
        category, description = (item.category, item.description) if custom else invoice.line_labels[item.key]
        rows.append([p(category), p(description), p(f"{item.quantity:g}", right),
                     number(item.rate, widths[3]), number(invoice.totals.line_amounts[item.key], widths[4])])
    split_tall_rows = any(item.description.count("\n") > 50 or item.category.count("\n") > 50 for item in invoice.lines)
    items = LongTable(rows, colWidths=widths, repeatRows=1, splitInRow=int(split_tall_rows), hAlign="LEFT")
    items.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [light, colors.white]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 1), (-1, -1), .5, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5 if len(invoice.lines) > 3 else 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 if len(invoice.lines) > 3 else 12),
        ("TOPPADDING", (0, 0), (-1, 0), 9), ("BOTTOMPADDING", (0, 0), (-1, 0), 9),
    ]))
    story.extend([items, Spacer(1, 13)])
    totals = invoice.totals
    wages = totals.base_amount - totals.line_amounts.get("overtime", 0) - totals.line_amounts.get("other", 0)
    entries = [("Wage subtotal (reference only)" if services_only else "Item subtotal" if custom else "Total wages", wages)]
    entries.extend((LINE_LABELS[key][0], totals.line_amounts[key]) for key in ("overtime", "other") if totals.line_amounts.get(key))
    if not services_only:
        entries.extend([(f"ESI ({invoice.esi_percentage:g}%)", totals.esi_amount), (f"PF ({invoice.pf_percentage:g}%)", totals.pf_amount)])
    entries.append((f"Service charge ({invoice.service_percentage:g}%)", totals.service_charge))
    if not services_only:
        entries.append(("Subtotal before GST", totals.subtotal))
    entries.extend([(f"CGST ({invoice.cgst_percentage:g}%)", totals.cgst_amount), (f"SGST ({invoice.sgst_percentage:g}%)", totals.sgst_amount)]
                   if invoice.uses_gst_percentages else [("GST (recorded amount)", totals.gst_amount)])
    summary_width = doc.width * .53
    money_width = summary_width * .37
    summary = table([[p(key, bold if i == 0 or key == "Subtotal before GST" else normal), number(value, money_width)]
                     for i, (key, value) in enumerate(entries)] + [[
        p("TOTAL (INR)", ParagraphStyle("ExecutiveTotalLabel", parent=bold, fontSize=10, leading=20, textColor=colors.white)),
        number(totals.total, money_width, total=True),
    ]], [summary_width - money_width, money_width], [
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, 0), .5, border), ("BACKGROUND", (0, -1), (-1, -1), navy),
        ("VALIGN", (0, -1), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, -1), (-1, -1), 9), ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
    ])
    information = [p("All amounts in INR", small), Spacer(1, 12)]
    if services_only:
        information.extend([p("Wages are used only to calculate service charges. Total payable includes service charges and GST.", small), Spacer(1, 12)])
    if supplier.payment_details:
        information.extend([p("PAYMENT DETAILS", label), Spacer(1, 5), p(supplier.payment_details, small), Spacer(1, 12)])
    if invoice.notes:
        information.extend([p("NOTES / PAYMENT TERMS", label), Spacer(1, 5), p(invoice.notes, small), Spacer(1, 12)])
    signature = [Spacer(1, 16), p(f"For {supplier.name}", ParagraphStyle("ExecutiveSignatory", parent=bold, fontSize=8, alignment=TA_RIGHT)),
                 Spacer(1, 25), p("Authorised signatory", ParagraphStyle("ExecutiveSignatureLabel", parent=small, alignment=TA_RIGHT))]
    info_width = doc.width - summary_width - 22
    info_height = sum(item.wrap(info_width, doc.height)[1] for item in information)
    if info_height > 200:
        # Long payment instructions and notes must flow across pages rather
        # than becoming an unsplittable row beside the totals.
        summary.hAlign = "RIGHT"
        story.extend([KeepTogether([summary]), Spacer(1, 16), *information, *signature])
    else:
        story.append(table([[information + signature, summary]], [doc.width - summary_width, summary_width], [
            ("RIGHTPADDING", (0, 0), (0, 0), 22)]))

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFillColor(navy)
        canvas.rect(0, A4[1] - 6, A4[0], 6, stroke=0, fill=1)
        canvas.setStrokeColor(border)
        canvas.setLineWidth(.5)
        canvas.line(36, 35, A4[0] - 36, 35)
        website = p(supplier.website, ParagraphStyle("ExecutiveFooter", parent=small, fontSize=6.5, leading=8))
        website.wrap(doc.width * .6, 24)
        website.drawOn(canvas, 36, 17)
        canvas.setFillColor(muted)
        canvas.setFont("InvoiceSans", 7)
        canvas.drawRightString(A4[0] - 36, 20, f"{invoice.invoice_number}  |  Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
