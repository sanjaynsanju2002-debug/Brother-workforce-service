"""Professional monthly attendance register downloads."""

import calendar
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile

from lib.invoices import InvoiceProfile

ASSETS = Path(__file__).resolve().parent.parent / "assets"
STATUS_SHORT = {
    "Present": "P", "Absent": "A", "Half-day": "HD", "Paid leave": "PL",
    "Unpaid leave": "UL", "Leave": "UL", "Holiday": "H", "Weekly off": "WO",
    "Unmarked": "-",
}
PAID_VALUE = {
    "Present": Decimal("1"), "Half-day": Decimal("0.5"), "Paid leave": Decimal("1"),
    "Holiday": Decimal("1"), "Weekly off": Decimal("1"),
}


def month_label(month: str) -> str:
    return f"{calendar.month_name[int(month[5:])]} {month[:4]}"


def register_rows(register: dict):
    year, number = int(register["month"][:4]), int(register["month"][5:])
    days = calendar.monthrange(year, number)[1]
    sheets = {sheet["attendance_date"]: sheet for sheet in register["sheets"] if sheet.get("status") == "Approved"}
    lookups = {day: {row["assignment_id"]: row for row in sheet.get("rows", [])} for day, sheet in sheets.items()}
    rows = []
    for employee in register["employees"]:
        statuses, counts, payable = [], {}, Decimal("0")
        for day in range(1, days + 1):
            key = f"{register['month']}-{day:02d}"
            status = lookups.get(key, {}).get(employee["assignment_id"], {}).get("status", "Unmarked")
            statuses.append(STATUS_SHORT.get(status, "-"))
            if status != "Unmarked":
                counts[status] = counts.get(status, 0) + 1
            payable += PAID_VALUE.get(status, Decimal("0"))
        rows.append({**employee, "statuses": statuses, "counts": counts, "payable_days": payable})
    return days, rows, len(sheets)


def export_attendance_xlsx(register: dict, supplier: InvoiceProfile) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    days, rows, approved = register_rows(register)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Attendance"
    navy, orange, pale, border = "0F2444", "EA580C", "F1F5F9", "CBD5E1"
    last_column = 3 + days + 8
    sheet.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last_column)
    sheet["A1"] = supplier.name
    sheet["A1"].font = Font(bold=True, size=16, color=navy)
    sheet["A2"] = supplier.address
    sheet.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last_column)
    sheet["A3"] = " | ".join(filter(None, (supplier.phone, supplier.email, supplier.website)))
    sheet.merge_cells(start_row=3, start_column=1, end_row=3, end_column=last_column)
    sheet["A5"] = "MONTHLY ATTENDANCE REGISTER"
    sheet["A5"].font = Font(bold=True, size=14, color=orange)
    sheet.merge_cells(start_row=5, start_column=1, end_row=5, end_column=last_column)
    sheet["A6"] = f"Company: {register['company_name']}"
    sheet.merge_cells(start_row=6, start_column=1, end_row=6, end_column=3 + days)
    sheet.cell(6, 4 + days, f"Month: {month_label(register['month'])} | Approved days: {approved}")
    sheet.merge_cells(start_row=6, start_column=4 + days, end_row=6, end_column=last_column)
    headers = ["No.", "Employee ID", "Employee name", *range(1, days + 1), "P", "A", "HD", "PL", "UL", "H", "WO", "Payable days"]
    for column, value in enumerate(headers, 1):
        cell = sheet.cell(8, column, value)
        cell.fill = PatternFill("solid", fgColor=navy)
        cell.font = Font(bold=True, color="FFFFFF", size=8)
        cell.alignment = Alignment(horizontal="center", vertical="center", text_rotation=90 if isinstance(value, int) else 0)
    status_columns = {name: 4 + days + index for index, name in enumerate(("P", "A", "HD", "PL", "UL", "H", "WO"))}
    thin = Side(style="thin", color=border)
    for index, row in enumerate(rows, 1):
        excel_row = 8 + index
        values = [index, row.get("employee_id") or "", row["full_name"], *row["statuses"]]
        for column, value in enumerate(values, 1):
            sheet.cell(excel_row, column, value)
        normalized_counts = {STATUS_SHORT.get(status, status): count for status, count in row["counts"].items()}
        for label, column in status_columns.items():
            sheet.cell(excel_row, column, normalized_counts.get(label, 0))
        sheet.cell(excel_row, last_column, float(row["payable_days"]))
        for column in range(1, last_column + 1):
            cell = sheet.cell(excel_row, column)
            cell.border = Border(bottom=thin)
            cell.alignment = Alignment(horizontal="left" if column == 3 else "center", vertical="center")
            if index % 2 == 0:
                cell.fill = PatternFill("solid", fgColor="F8FAFC")
    sheet.freeze_panes = "D9"
    sheet.auto_filter.ref = f"A8:{get_column_letter(last_column)}{8 + len(rows)}"
    sheet.column_dimensions["A"].width = 6
    sheet.column_dimensions["B"].width = 15
    sheet.column_dimensions["C"].width = 28
    for column in range(4, 4 + days):
        sheet.column_dimensions[get_column_letter(column)].width = 4
    for column in range(4 + days, last_column + 1):
        sheet.column_dimensions[get_column_letter(column)].width = 10 if column == last_column else 6
    sheet.sheet_view.showGridLines = False
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A3
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.print_title_rows = "1:8"
    sheet.print_area = f"A1:{get_column_letter(last_column)}{8 + len(rows)}"
    sheet.oddFooter.center.text = f"{supplier.name} | {month_label(register['month'])} | Page &P of &N"
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def export_attendance_pdf(register: dict, supplier: InvoiceProfile) -> bytes:
    import reportlab
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A3, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Image, LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    fonts = Path(reportlab.__file__).parent / "fonts"
    for name, filename in (("AttendanceSans", "Vera.ttf"), ("AttendanceBold", "VeraBd.ttf")):
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(fonts / filename)))
    days, rows, approved = register_rows(register)
    output = BytesIO()
    page = landscape(A3)
    doc = SimpleDocTemplate(output, pagesize=page, leftMargin=22, rightMargin=22, topMargin=28, bottomMargin=28,
                            title=f"Attendance - {register['company_name']} - {register['month']}", author=supplier.name)
    navy, orange, muted = (colors.HexColor(value) for value in ("#0F2444", "#EA580C", "#64748B"))
    body = ParagraphStyle("AttendanceBody", fontName="AttendanceSans", fontSize=6, leading=8, textColor=navy)
    bold = ParagraphStyle("AttendanceBold", parent=body, fontName="AttendanceBold")
    heading = ParagraphStyle("AttendanceHeading", parent=bold, fontSize=13, leading=16)
    small = ParagraphStyle("AttendanceSmall", parent=body, fontSize=5.5, leading=7, textColor=muted)

    def p(value, style=body):
        return Paragraph(escape(str(value)).replace("\n", "<br/>"), style)

    with ZipFile(ASSETS / "invoice-template.xlsx") as archive:
        logo = Image(BytesIO(archive.read("xl/media/image.png")), width=80, height=54.5)
    brand = [p(supplier.name, heading), p(supplier.address), p(" | ".join(filter(None, (supplier.phone, supplier.email, supplier.website))), small)]
    header = Table([[logo, brand]], colWidths=[95, doc.width - 95])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story = [header, Spacer(1, 4), p("MONTHLY ATTENDANCE REGISTER", heading), Spacer(1, 5),
             p(f"Company: {register['company_name']}   |   Month: {month_label(register['month'])}   |   Approved days: {approved}"), Spacer(1, 8)]
    headers = ["No.", "ID", "Employee", *[str(day) for day in range(1, days + 1)], "P", "A", "HD", "PL", "UL", "H", "WO", "Pay"]
    data = [[p(value, bold) for value in headers]]
    for index, row in enumerate(rows, 1):
        normalized_counts = {STATUS_SHORT.get(status, status): count for status, count in row["counts"].items()}
        values = [index, row.get("employee_id") or "-", row["full_name"], *row["statuses"],
                  *[normalized_counts.get(label, 0) for label in ("P", "A", "HD", "PL", "UL", "H", "WO")], f"{row['payable_days']:g}"]
        data.append([p(value, bold if column in {2, len(values) - 1} else body) for column, value in enumerate(values)])
    fixed = 24 + 54 + 112 + 8 * 28
    day_width = max(14, (doc.width - fixed) / days)
    widths = [24, 54, 112, *([day_width] * days), *([28] * 8)]
    table = LongTable(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (3, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.extend([table, Spacer(1, 7), p("Legend: P Present | A Absent | HD Half day | PL Paid leave | UL Unpaid leave | H Government holiday | WO Weekly off. Payable days include P, PL, H and WO as 1 day and HD as 0.5 day.", small)])

    def footer(canvas, document):
        canvas.saveState(); canvas.setFont("AttendanceSans", 6); canvas.setFillColor(muted)
        canvas.drawString(22, 14, f"{supplier.name[:70]} | Attendance {register['month']}")
        canvas.drawRightString(page[0] - 22, 14, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
