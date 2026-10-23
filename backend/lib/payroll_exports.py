"""Branded payroll downloads from the saved register, including ESI and PF."""

import calendar
import re
from copy import deepcopy
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from lib.payroll import Payroll

ASSETS = Path(__file__).resolve().parent.parent / "assets"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def month_label(month: str) -> str:
    return f"{calendar.month_name[int(month[5:])]} {month[:4]}"


def export_payroll_xlsx(payroll: Payroll) -> bytes:
    """Fill the Artifact Tool template, preserving its styles and embedded logo.

    Each formula has a saved-value cache so Excel and other viewers display the
    same amounts immediately, before their first recalculation.
    """
    with ZipFile(ASSETS / "payroll-template.xlsx") as source:
        sheet = ET.fromstring(source.read("xl/worksheets/sheet1.xml"))
        data = sheet.find(f"{{{NS}}}sheetData")
        prototype = next(row for row in data if row.get("r") == "16")
        count = len(payroll.lines)
        if not count:
            raise ValueError("A payroll register must include employees")
        delta = count - 1
        last, total = 15 + count, 16 + count

        def shifted(ref):
            return re.sub(r"(\$?[A-Z]+\$?)(\d+)", lambda match: match[1] + str(int(match[2]) + (delta if int(match[2]) >= 17 else 0)), ref)

        for row in list(data):
            number = int(row.get("r"))
            if number >= 17:
                row.set("r", str(number + delta))
                for cell in row:
                    cell.set("r", shifted(cell.get("r")))
        index = list(data).index(prototype)
        data.remove(prototype)
        for offset in range(count):
            row = deepcopy(prototype)
            number = 16 + offset
            row.set("r", str(number))
            # Grow wrapped employee names and IDs instead of truncating them.
            person = payroll.lines[offset]
            row.set("ht", str(max(28, 14 * max((len(person.full_name) + 24) // 25, (len(person.employee_id or "") + 11) // 12))))
            for cell in row:
                cell.set("r", re.sub(r"\d+$", str(number), cell.get("r")))
            data.insert(index + offset, row)
        cells = {cell.get("r"): cell for cell in sheet.iter(f"{{{NS}}}c")}

        def write(ref, value, formula=None):
            cell = cells[ref]
            for child in list(cell):
                cell.remove(child)
            cell.attrib.pop("t", None)
            if isinstance(value, str):
                # IDs and names are always text, including leading zeros or '='.
                cell.set("t", "inlineStr")
                text = ET.SubElement(ET.SubElement(cell, f"{{{NS}}}is"), f"{{{NS}}}t")
                text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                text.text = value
            else:
                if formula:
                    ET.SubElement(cell, f"{{{NS}}}f").text = formula
                ET.SubElement(cell, f"{{{NS}}}v").text = str(value)

        supplier, totals = payroll.supplier, payroll.totals
        write("C2", supplier.name)
        write("C3", supplier.address)
        write("C5", " | ".join(filter(None, (supplier.phone, supplier.email))))
        write("C6", " | ".join(filter(None, (supplier.website, f"GSTIN: {supplier.gstin}" if supplier.gstin else ""))))
        write("A9", f"Company: {payroll.company_name}")
        write("G9", f"Payroll month: {month_label(payroll.month)}")
        write("A10", f"Worksite: {payroll.company_location}" if payroll.company_location else "")
        write("G10", f"Employees: {count}")
        # Long company names remain visible in the merged header.
        for number, length, chars in ((9, len(payroll.company_name) + 9, 85), (10, len(payroll.company_location) + 10, 85)):
            next(row for row in data if row.get("r") == str(number)).set("ht", str(max(22, 14 * ((length + chars - 1) // chars))))
        for offset, line in enumerate(payroll.lines, 16):
            for col, value in {"A": offset - 15, "B": line.employee_id or "", "C": line.full_name + (f" | OT {line.overtime_hours.normalize():g} h x INR {line.overtime_rate}" if line.overtime_hours else ""), "D": line.worked_days, "E": line.daily_rate, "G": line.esi_percentage, "I": line.pf_percentage}.items():
                write(f"{col}{offset}", value)
            for col, value, formula in (
                ("F", line.gross_wages, (f"ROUND(D{offset}*E{offset}+{line.overtime_hours * line.overtime_rate},2)" if line.overtime_hours else f"ROUND(D{offset}*E{offset},2)")),
                ("H", line.esi_deduction, f"ROUND(F{offset}*G{offset}/100,2)"),
                ("J", line.pf_deduction, f"ROUND(F{offset}*I{offset}/100,2)"),
                ("K", line.payable, f"F{offset}-H{offset}-J{offset}"),
            ):
                write(f"{col}{offset}", value, formula)
        write(f"A{total}", f"TOTAL ({count} employees)")
        for col, value in {"D": totals.worked_days, "F": totals.gross_wages, "H": totals.esi_deduction, "J": totals.pf_deduction, "K": totals.payable}.items():
            write(f"{col}{total}", value, f"SUM({col}16:{col}{last})")
        for col, target, value in (("A", "F", totals.gross_wages), ("D", "H", totals.esi_deduction), ("G", "J", totals.pf_deduction), ("J", "K", totals.payable)):
            write(f"{col}13", value, f"{target}{total}")
        notes_row = 19 + delta
        write(f"A{notes_row}", f"Notes: {payroll.notes}" if payroll.notes else "")
        next(row for row in data if row.get("r") == str(notes_row)).set("ht", str(max(22, 14 * sum(max(1, (len(part) + 139) // 140) for part in payroll.notes.split("\n")))))
        merges = sheet.find(f"{{{NS}}}mergeCells")
        for merge in merges:
            merge.set("ref", shifted(merge.get("ref")))
        dimension = sheet.find(f"{{{NS}}}dimension")
        if dimension is not None:
            dimension.set("ref", f"A1:K{20 + delta}")

        # Insert worksheet children in OOXML order, retaining all drawing links.
        order = ["sheetPr", "dimension", "sheetViews", "sheetFormatPr", "cols", "sheetData", "sheetCalcPr", "sheetProtection", "protectedRanges", "scenarios", "autoFilter", "sortState", "dataConsolidate", "customSheetViews", "mergeCells", "phoneticPr", "conditionalFormatting", "dataValidations", "hyperlinks", "printOptions", "pageMargins", "pageSetup", "headerFooter", "rowBreaks", "colBreaks", "customProperties", "cellWatches", "ignoredErrors", "smartTags", "drawing", "legacyDrawing", "legacyDrawingHF", "picture", "oleObjects", "controls", "webPublishItems", "tableParts", "extLst"]

        def child(name):
            existing = sheet.find(f"{{{NS}}}{name}")
            if existing is not None:
                return existing
            element = ET.Element(f"{{{NS}}}{name}")
            rank = order.index(name)
            position = next((i for i, item in enumerate(sheet) if item.tag.rsplit("}", 1)[-1] in order and order.index(item.tag.rsplit("}", 1)[-1]) > rank), len(sheet))
            sheet.insert(position, element)
            return element

        child("autoFilter").set("ref", f"A15:K{last}")
        validations = child("dataValidations")
        for item in list(validations):
            validations.remove(item)
        days = calendar.monthrange(int(payroll.month[:4]), int(payroll.month[5:]))[1]
        for col, limit, title in (("D", days, "Worked days"), ("E", 1_000_000_000, "Daily rate")):
            rule = ET.SubElement(validations, f"{{{NS}}}dataValidation", type="decimal", operator="between", allowBlank="1", showErrorMessage="1", errorStyle="stop", errorTitle=title, error=f"Enter a number from 0 to {limit}.", sqref=f"{col}16:{col}{last}")
            ET.SubElement(rule, f"{{{NS}}}formula1").text = "0"
            ET.SubElement(rule, f"{{{NS}}}formula2").text = str(limit)
        for col in ("G", "I"):
            rule = ET.SubElement(validations, f"{{{NS}}}dataValidation", type="custom", allowBlank="1", showErrorMessage="1", errorStyle="stop", errorTitle="Deduction percentage", error="Enter percentages from 0 to 100; combined deductions cannot exceed gross wages.", sqref=f"{col}16:{col}{last}")
            ET.SubElement(rule, f"{{{NS}}}formula1").text = "AND($G16>=0,$I16>=0,$G16+$I16<=100,ROUND($F16*$G16/100,2)+ROUND($F16*$I16/100,2)<=$F16)"
        validations.set("count", "4")
        properties = child("sheetPr")
        setup = properties.find(f"{{{NS}}}pageSetUpPr")
        if setup is None:
            setup = ET.SubElement(properties, f"{{{NS}}}pageSetUpPr")
        setup.set("fitToPage", "1")
        child("pageSetup").attrib.update(paperSize="9", orientation="landscape", fitToWidth="1", fitToHeight="0")
        child("pageMargins").attrib.update(left="0.25", right="0.25", top="0.35", bottom="0.35", header="0.15", footer="0.15")
        footer = child("headerFooter")
        odd = footer.find(f"{{{NS}}}oddFooter")
        if odd is None:
            odd = ET.SubElement(footer, f"{{{NS}}}oddFooter")
        odd.text = f"&L{supplier.name.replace('&', '&&')} | {payroll.month}&RPage &P of &N"
        workbook = ET.fromstring(source.read("xl/workbook.xml"))
        defined = workbook.find(f"{{{NS}}}definedNames")
        if defined is None:
            defined = ET.Element(f"{{{NS}}}definedNames")
            calc = workbook.find(f"{{{NS}}}calcPr")
            workbook.insert(list(workbook).index(calc) if calc is not None else len(workbook), defined)
        for item in list(defined):
            if item.get("name") in ("_xlnm.Print_Area", "_xlnm.Print_Titles"):
                defined.remove(item)
        ET.SubElement(defined, f"{{{NS}}}definedName", name="_xlnm.Print_Area", localSheetId="0").text = f"'Payroll'!$A$1:$K${20 + delta}"
        ET.SubElement(defined, f"{{{NS}}}definedName", name="_xlnm.Print_Titles", localSheetId="0").text = "'Payroll'!$1:$15"
        calc = workbook.find(f"{{{NS}}}calcPr")
        if calc is None:
            calc = ET.SubElement(workbook, f"{{{NS}}}calcPr")
        calc.attrib.update(calcMode="auto", fullCalcOnLoad="1")
        output = BytesIO()
        with ZipFile(output, "w", ZIP_DEFLATED) as target:
            for name in source.namelist():
                contents = source.read(name)
                if name == "xl/worksheets/sheet1.xml":
                    contents = ET.tostring(sheet, encoding="utf-8", xml_declaration=True)
                elif name == "xl/workbook.xml":
                    contents = ET.tostring(workbook, encoding="utf-8", xml_declaration=True)
                target.writestr(name, contents)
    return output.getvalue()


def export_payroll_pdf(payroll: Payroll) -> bytes:
    import reportlab
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Image, KeepTogether, LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    fonts = Path(reportlab.__file__).parent / "fonts"
    for name, filename in (("PayrollSans", "Vera.ttf"), ("PayrollBold", "VeraBd.ttf")):
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(fonts / filename)))
    navy, orange, muted = (colors.HexColor(value) for value in ("#0F2444", "#C2410C", "#64748B"))
    output = BytesIO()
    page = landscape(A4)
    doc = SimpleDocTemplate(output, pagesize=page, leftMargin=28, rightMargin=28, topMargin=34, bottomMargin=34,
                            title=f"Payroll - {payroll.company_name} - {payroll.month}", author=payroll.supplier.name)
    body = ParagraphStyle("PayrollBody", fontName="PayrollSans", fontSize=8, leading=11, textColor=navy, alignment=TA_LEFT)
    small = ParagraphStyle("PayrollSmall", parent=body, fontSize=7, leading=10)
    bold = ParagraphStyle("PayrollStrong", parent=body, fontName="PayrollBold")
    heading = ParagraphStyle("PayrollHeading", parent=bold, fontSize=13, leading=17)
    muted_style = ParagraphStyle("PayrollMuted", parent=small, textColor=muted)
    center = ParagraphStyle("PayrollCenter", parent=body, alignment=TA_CENTER)
    tablehead = ParagraphStyle("PayrollTableHead", parent=small, fontName="PayrollBold", textColor=colors.white)

    def p(text, style=body):
        return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)

    def money(value):
        return f"{value:,.2f}"

    supplier, totals = payroll.supplier, payroll.totals
    with ZipFile(ASSETS / "invoice-template.xlsx") as archive:
        logo = Image(BytesIO(archive.read("xl/media/image.png")), width=92, height=62.7)
    brand = [p(supplier.name, heading), p(supplier.address), p(" | ".join(filter(None, (supplier.phone, supplier.email))), small),
             p(" | ".join(filter(None, (supplier.website, f"GSTIN: {supplier.gstin}" if supplier.gstin else ""))), small)]
    header = Table([[logo, brand]], colWidths=[110, doc.width - 110])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    story = [header, Spacer(1, 5), p("PAYROLL REGISTER", heading), Spacer(1, 8)]
    details = Table([[[p("COMPANY", muted_style), p(payroll.company_name, bold), p(payroll.company_location, small)],
                      [p("PAYROLL MONTH", muted_style), p(month_label(payroll.month), bold), p(f"{totals.employee_count} employees | {totals.worked_days:g} total worked days", small)]]],
                    colWidths=[doc.width * .62, doc.width * .38])
    details.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F5F9")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.extend([details, Spacer(1, 10)])
    summary = Table([[p(label, small) for label in ("Gross wages (INR)", "ESI deduction (INR)", "PF deduction (INR)", "Payable (INR)")],
                     [p(money(value), heading) for value in (totals.gross_wages, totals.esi_deduction, totals.pf_deduction, totals.payable)]],
                    colWidths=[doc.width / 4] * 4)
    summary.setStyle(TableStyle([("BACKGROUND", (0, 0), (2, -1), colors.HexColor("#F8FAFC")), ("BACKGROUND", (3, 0), (3, -1), colors.HexColor("#FFEDD5")), ("LINEABOVE", (0, 0), (-1, 0), .6, orange), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.extend([summary, Spacer(1, 12)])
    labels = ("No.", "Employee ID", "Employee name", "Worked days", "Daily rate (INR)", "Gross wages (INR)", "ESI %", "ESI deduction (INR)", "PF %", "PF deduction (INR)", "Payable (INR)")
    rows = [[p(label, tablehead) for label in labels]]
    for number, line in enumerate(payroll.lines, 1):
        rows.append([p(number, center), p(line.employee_id or "—"), p(line.full_name + (f"\nOT: {line.overtime_hours.normalize():g} h x INR {money(line.overtime_rate)}" if line.overtime_hours else "")), p(f"{line.worked_days:g}", center),
                     p(money(line.daily_rate)), p(money(line.gross_wages)), p(f"{line.esi_percentage:g}", center),
                     p(money(line.esi_deduction)), p(f"{line.pf_percentage:g}", center), p(money(line.pf_deduction)), p(money(line.payable), bold)])
    rows.append([p("TOTAL", bold), "", "", p(f"{totals.worked_days:g}", center), "", p(money(totals.gross_wages), bold), "", p(money(totals.esi_deduction), bold), "", p(money(totals.pf_deduction), bold), p(money(totals.payable), bold)])
    widths = [.035, .09, .20, .07, .09, .105, .055, .10, .055, .10, .10]
    table = LongTable(rows, colWidths=[doc.width * width for width in widths], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), navy), ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F8FAFC")]),
                               ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFEDD5")), ("SPAN", (0, -1), (2, -1)),
                               ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 1), (-1, -1), .3, colors.HexColor("#E2E8F0")),
                               ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                               ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
    story.extend([table, Spacer(1, 10), p("Gross wages = worked days x daily rate + overtime hours x overtime hourly rate. ESI and PF each use the entered percentage of gross wages. Payable = gross wages - ESI - PF.", muted_style)])
    if payroll.notes:
        story.append(KeepTogether([Spacer(1, 7), p("Notes", bold), p(payroll.notes)]))

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("PayrollSans", 7)
        canvas.setFillColor(muted)
        canvas.drawString(28, 18, f"{supplier.name[:65]} | Payroll {payroll.month}")
        canvas.drawRightString(page[0] - 28, 18, f"Page {document.page}")
        if document.page > 1:
            canvas.drawString(28, page[1] - 20, f"PAYROLL REGISTER | {payroll.company_name[:80]} | {month_label(payroll.month)}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
